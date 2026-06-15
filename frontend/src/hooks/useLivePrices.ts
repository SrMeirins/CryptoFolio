import { useEffect } from 'react'
import { usePricesStore } from '../store/pricesStore'

export function useLivePrices() {
  const { setPrices, mergePrices, setConnected } = usePricesStore()

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

  // WebSocket para actualizaciones continuas
  useEffect(() => {
    let ws: WebSocket
    let reconnectTimer: ReturnType<typeof setTimeout>

    function connect() {
      const wsUrl = import.meta.env.VITE_WS_URL || 'ws://localhost:3001'
      ws = new WebSocket(`${wsUrl}/ws/prices`)

      ws.onopen = () => {
        setConnected(true)
      }

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          if (data.type === 'prices') {
            mergePrices(data.payload)
          }
        } catch {
          // ignorar
        }
      }

      ws.onclose = () => {
        setConnected(false)
        reconnectTimer = setTimeout(connect, 3000)
      }

      ws.onerror = () => {
        ws.close()
      }
    }

    connect()

    return () => {
      clearTimeout(reconnectTimer)
      ws?.close()
    }
  }, [setPrices, setConnected])
}
