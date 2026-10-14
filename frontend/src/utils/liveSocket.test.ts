import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createLiveSocket, type SocketLike } from './liveSocket'

// Doble de WebSocket: registra instancias y permite disparar eventos.
class FakeSocket implements SocketLike {
  static instances: FakeSocket[] = []
  onopen: (() => void) | null = null
  onmessage: ((e: { data: string }) => void) | null = null
  onclose: (() => void) | null = null
  onerror: (() => void) | null = null
  closed = false
  readyState = 0 // CONNECTING
  constructor(public url: string) { FakeSocket.instances.push(this) }
  close() {
    if (this.closed) return
    // Un navegador real avisa en consola si se cierra un socket que aún conecta (#201).
    if (this.readyState === 0) FakeSocket.closedWhileConnecting++
    this.closed = true
    this.readyState = 3
    this.onclose?.()
  }
  open() { this.readyState = 1; this.onopen?.() }
  static closedWhileConnecting = 0
  emit(msg: unknown) { this.onmessage?.({ data: JSON.stringify(msg) }) }
}

const last = () => FakeSocket.instances[FakeSocket.instances.length - 1]

describe('createLiveSocket (#194)', () => {
  beforeEach(() => { vi.useFakeTimers(); FakeSocket.instances = []; FakeSocket.closedWhileConnecting = 0 })
  afterEach(() => { vi.useRealTimers() })

  const start = () => {
    const messages: unknown[] = []
    const states: boolean[] = []
    const live = createLiveSocket({
      url: 'ws://x/ws/prices',
      createSocket: url => new FakeSocket(url),
      onMessage: m => messages.push(m),
      onConnectedChange: c => states.push(c),
    })
    return { live, messages, states }
  }

  it('entrega los mensajes y avisa de la conexión', () => {
    const { messages, states } = start()
    last().open()
    last().emit({ type: 'prices', payload: { BTC: 1 } })
    expect(states).toEqual([true])
    expect(messages).toEqual([{ type: 'prices', payload: { BTC: 1 } }])
  })

  it('tras un cierre reconecta con espera creciente (3, 6, 12 s…) y vuelve a 3 s tras recibir datos', () => {
    start()
    last().close()
    vi.advanceTimersByTime(3_000)
    expect(FakeSocket.instances).toHaveLength(2)

    last().close()                       // vuelve a fallar sin datos
    vi.advanceTimersByTime(5_999)
    expect(FakeSocket.instances).toHaveLength(2)
    vi.advanceTimersByTime(1)
    expect(FakeSocket.instances).toHaveLength(3)

    last().open()
    last().emit({ type: 'status', payload: { feedAgeMs: 0 } })
    last().close()
    vi.advanceTimersByTime(3_000)
    expect(FakeSocket.instances).toHaveLength(4)
  })

  it('al cerrarlo no queda ningún socket ni reconexión viva (StrictMode, desmontaje)', () => {
    const { live, states } = start()
    live.close()                         // cierre mientras aún conecta
    last().open()                        // el socket termina de abrir: se cierra entonces
    expect(last().closed).toBe(true)
    vi.advanceTimersByTime(120_000)
    expect(FakeSocket.instances).toHaveLength(1)
    expect(states).toEqual([])           // el cierre deliberado no altera el estado
  })

  it('no cierra un socket que aún está conectando: espera a que abra (sin aviso en consola, #201)', () => {
    const { live, messages } = start()
    live.close()
    expect(last().closed).toBe(false)    // cerrarlo ahora haría que el navegador avisara
    last().open()
    last().emit({ type: 'prices', payload: {} })
    expect(last().closed).toBe(true)
    expect(FakeSocket.closedWhileConnecting).toBe(0)
    expect(messages).toEqual([])         // ya cerrado: no entrega mensajes
  })

  it('si el socket que conectaba falla antes de abrir, no queda nada pendiente', () => {
    const { live } = start()
    live.close()
    last().onerror?.()
    vi.advanceTimersByTime(120_000)
    expect(FakeSocket.instances).toHaveLength(1)
  })

  it('al cerrarlo durante la espera de reconexión, la cancela', () => {
    const { live } = start()
    last().close()
    live.close()
    vi.advanceTimersByTime(120_000)
    expect(FakeSocket.instances).toHaveLength(1)
  })

  it('si el WebSocket deja de recibir mensajes 30 s, lo cierra y reconecta', () => {
    const { states } = start()
    last().open()
    vi.advanceTimersByTime(29_000)
    expect(last().closed).toBe(false)
    vi.advanceTimersByTime(6_000)
    expect(FakeSocket.instances[0].closed).toBe(true)
    expect(states).toEqual([true, false])
    vi.advanceTimersByTime(3_000)
    expect(FakeSocket.instances).toHaveLength(2)
  })

  it('los mensajes periódicos lo mantienen vivo', () => {
    start()
    last().open()
    for (let i = 0; i < 10; i++) { vi.advanceTimersByTime(10_000); last().emit({ type: 'status', payload: { feedAgeMs: 0 } }) }
    expect(FakeSocket.instances).toHaveLength(1)
  })

  it('ignora mensajes que no son JSON', () => {
    const { messages } = start()
    last().open()
    last().onmessage?.({ data: 'no-json' })
    expect(messages).toEqual([])
  })
})
