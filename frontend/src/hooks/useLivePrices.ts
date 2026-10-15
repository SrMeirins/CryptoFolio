import { useEffect } from 'react'
import { usePricesStore } from '../store/pricesStore'
import { createLiveSocket, type SocketLike } from '../utils/liveSocket'

interface LiveMessage {
  type?: string
  payload?: unknown
}

export function useLivePrices() {
  const { setPrices, mergePrices, mergeOpen24, setConnected, setFeedStatus } = usePricesStore()

  // Carga inicial via REST — instantáneo, sin esperar WebSocket
  useEffect(() => {
    fetch('/api/prices/live')
      .then((r) => r.json())
      .then((data: Record<string, number>) => {
        if (Object.keys(data).length > 0) {
          setPrices(data)
        }
      })
      .catch(() => {/* ignorar, el WS lo cubrirá */})
  }, [setPrices])

  // WebSocket para actualizaciones continuas. La reconexión, la detección de
  // un socket mudo y la limpieza al desmontar viven en createLiveSocket (#194).
  useEffect(() => {
    // Mismo origen que la página (protocolo+host actuales), nunca un puerto
    // hardcodeado: en Docker el backend solo es alcanzable como backend:3001
    // dentro de la red interna — el proxy de Vite ('/ws' en vite.config.ts)
    // o un reverse proxy en producción son quienes redirigen esta ruta.
    const wsUrl = import.meta.env.VITE_WS_URL
      || `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}`

    const live = createLiveSocket({
      url: `${wsUrl}/ws/prices`,
      // El WebSocket del navegador cumple SocketLike en ejecución; sus tipos DOM
      // (this + MessageEvent) son más estrictos que la interfaz mínima.
      createSocket: (url) => new WebSocket(url) as unknown as SocketLike,
      onConnectedChange: setConnected,
      onMessage: (raw) => {
        const message = raw as LiveMessage
        if (message.type === 'prices') mergePrices(message.payload as Record<string, number>)
        else if (message.type === 'open24') mergeOpen24(message.payload as Record<string, number>)
        else if (message.type === 'status') {
          const payload = message.payload as { feedAgeMs?: unknown; pairs?: unknown; binanceConnected?: unknown } | undefined
          setFeedStatus({
            feedAgeMs: typeof payload?.feedAgeMs === 'number' ? payload.feedAgeMs : null,
            statusAt: Date.now(),
            pairs: typeof payload?.pairs === 'number' ? payload.pairs : null,
            binanceConnected: typeof payload?.binanceConnected === 'boolean' ? payload.binanceConnected : null,
          })
        }
      },
    })

    return () => live.close()
  }, [mergePrices, mergeOpen24, setConnected, setFeedStatus])
}
