import type { LiveStatus } from './liveStatus'
import { formatNumber } from './format'

// Indicador de estado único de la cabecera (#200): textos de la píldora y de
// su tooltip. Funciones puras; el componente solo las pinta.

/** «hace 2 s», «hace 3 min», «hace 1 h». */
export function relativeAge(ms: number): string {
  const secs = Math.max(0, Math.floor(ms / 1000))
  if (secs < 60) return `hace ${secs} s`
  if (secs < 3600) return `hace ${Math.floor(secs / 60)} min`
  return `hace ${Math.floor(secs / 3600)} h`
}

/** Texto de la píldora: «En vivo · hace 2 s», «Sin actualizaciones» u «Offline». */
export function indicatorLabel(status: LiveStatus, lastUpdateMs: number | null, now: number): string {
  if (status === 'offline') return 'Offline'
  if (status === 'stale') return 'Sin actualizaciones'
  return lastUpdateMs === null ? 'En vivo' : `En vivo · ${relativeAge(now - lastUpdateMs)}`
}

/** Estado del feed para el tooltip, con el motivo si no llegan precios. */
export function feedDescription({ status, pairs, binanceConnected }: {
  status: LiveStatus
  pairs: number | null
  binanceConnected: boolean | null
}): string {
  if (status === 'offline') return 'Sin conexión con el servidor de precios. Se reintenta automáticamente.'
  if (binanceConnected === false) return 'El servidor no está conectado a Binance; está reintentando la conexión.'
  const conn = pairs ? `Binance conectado · ${pairs} ${pairs === 1 ? 'par' : 'pares'}` : 'Binance conectado'
  return status === 'stale' ? `${conn}, pero no llegan precios nuevos desde hace más de un minuto.` : conn
}

/** Tipo en vivo para el tooltip del selector de moneda: «1 € = 1,1217 $ · vía USDT, en vivo». */
export function liveRateText(usdtEur: number | undefined): string {
  if (usdtEur === undefined || !(usdtEur > 0)) return 'Tipo EUR/USD aún no disponible (se toma del precio de USDT).'
  return `1 € = ${formatNumber(1 / usdtEur, 4, 4)} $ · vía USDT, en vivo`
}
