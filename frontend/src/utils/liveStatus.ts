// Estado del indicador de precios en vivo (#194). Antes solo reflejaba la
// conexión navegador ↔ backend y marcaba «Live» aunque el feed de Binance
// llevara tiempo sin entregar precios.

export type LiveStatus = 'live' | 'stale' | 'offline'

/** Más de este tiempo sin datos del feed: «Sin actualizaciones». */
export const FEED_STALE_MS = 60_000

export function liveStatus({ connected, feedAgeMs, statusAt, now }: {
  connected: boolean
  feedAgeMs: number | null   // antigüedad del último dato del feed según el último estado del backend
  statusAt: number | null    // cuándo llegó ese estado (null: el backend aún no ha enviado ninguno)
  now: number
}): LiveStatus {
  if (!connected) return 'offline'
  if (statusAt === null) return 'live'
  if (feedAgeMs === null) return 'stale'
  return feedAgeMs + (now - statusAt) > FEED_STALE_MS ? 'stale' : 'live'
}
