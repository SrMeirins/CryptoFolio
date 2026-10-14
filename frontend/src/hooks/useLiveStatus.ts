import { usePricesStore } from '../store/pricesStore'
import { liveStatus, type LiveStatus } from '../utils/liveStatus'
import { useNow } from './useNow'

/** Estado del indicador de precios en vivo, reevaluado cada 5 s (#194). */
export function useLiveStatus(): LiveStatus {
  const connected = usePricesStore(s => s.connected)
  const feedAgeMs = usePricesStore(s => s.feedAgeMs)
  const statusAt = usePricesStore(s => s.statusAt)
  const now = useNow(5_000)
  return liveStatus({ connected, feedAgeMs, statusAt, now })
}

export const LIVE_STATUS_META: Record<LiveStatus, { label: string; dot: string; title: string }> = {
  live: { label: 'Live', dot: 'bg-accent-green animate-pulse', title: 'Precios en vivo' },
  stale: { label: 'Sin actualizaciones', dot: 'bg-accent-amber', title: 'Conectado, pero no llegan precios nuevos de Binance desde hace más de un minuto' },
  offline: { label: 'Offline', dot: 'bg-gray-500', title: 'Sin conexión con el servidor de precios' },
}
