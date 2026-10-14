// Conexión WebSocket de precios en vivo (#194), separada del hook para poder
// probar su ciclo de vida sin navegador:
//
// - Reconexión con espera creciente (3 s, 6 s, 12 s… hasta 30 s), que vuelve
//   a 3 s en cuanto llega un mensaje.
// - Vigilancia: el backend envía un estado cada 10 s; si en 30 s no llega
//   ningún mensaje, el socket se da por muerto, se cierra y se reconecta.
// - close() lo detiene todo: quita los manejadores antes de cerrar, para que
//   el cierre deliberado (desmontaje, StrictMode) no programe reconexiones
//   que nadie cancelaría. Un socket que aún está conectando no se cierra en
//   ese momento (el navegador avisaría en consola de «conexión interrumpida»,
//   #201): se cierra en cuanto abre.

export interface SocketLike {
  readyState?: number
  onopen: (() => void) | null
  onmessage: ((e: { data: string }) => void) | null
  onclose: (() => void) | null
  onerror: (() => void) | null
  close(): void
}

export interface LiveSocketOptions {
  url: string
  createSocket: (url: string) => SocketLike
  onMessage: (message: unknown) => void
  onConnectedChange: (connected: boolean) => void
}

const RECONNECT_BASE_MS = 3_000
const RECONNECT_MAX_MS = 30_000
const SILENCE_MS = 30_000
const WATCH_INTERVAL_MS = 5_000
const CONNECTING = 0

export function createLiveSocket({ url, createSocket, onMessage, onConnectedChange }: LiveSocketOptions): { close(): void } {
  let socket: SocketLike | null = null
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null
  let watchTimer: ReturnType<typeof setInterval> | null = null
  let delay = RECONNECT_BASE_MS
  let lastMessageAt = 0
  let connected = false
  let disposed = false

  const setConnected = (value: boolean) => {
    if (connected === value) return
    connected = value
    onConnectedChange(value)
  }

  const stopWatch = () => { if (watchTimer) { clearInterval(watchTimer); watchTimer = null } }

  function detach(s: SocketLike) {
    s.onopen = null
    s.onmessage = null
    s.onclose = null
    s.onerror = null
  }

  function scheduleReconnect() {
    if (disposed) return
    const wait = delay
    delay = Math.min(delay * 2, RECONNECT_MAX_MS)
    reconnectTimer = setTimeout(connect, wait)
  }

  function connect() {
    reconnectTimer = null
    if (disposed) return
    const s = createSocket(url)
    socket = s

    s.onopen = () => {
      lastMessageAt = Date.now()
      setConnected(true)
      stopWatch()
      watchTimer = setInterval(() => {
        if (Date.now() - lastMessageAt >= SILENCE_MS) s.close()  // socket mudo: se fuerza la reconexión
      }, WATCH_INTERVAL_MS)
    }
    s.onmessage = (e) => {
      lastMessageAt = Date.now()
      delay = RECONNECT_BASE_MS
      let message: unknown
      try { message = JSON.parse(e.data) } catch { return }
      onMessage(message)
    }
    s.onclose = () => {
      detach(s)
      stopWatch()
      if (socket === s) socket = null
      setConnected(false)
      scheduleReconnect()
    }
    s.onerror = () => s.close()
  }

  connect()

  return {
    close() {
      disposed = true
      if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null }
      stopWatch()
      if (socket) {
        const s = socket
        socket = null
        detach(s)
        if (s.readyState === CONNECTING) {
          // Cerrar ahora haría que el navegador avisara en consola: se espera
          // a que abra (o a que falle, en cuyo caso ya se cierra solo).
          s.onopen = () => s.close()
          s.onerror = () => { /* el navegador lo cierra por sí mismo */ }
        } else {
          s.close()
        }
      }
    },
  }
}
