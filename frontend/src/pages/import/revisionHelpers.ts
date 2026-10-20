import type { DepositReview, PreviewTransaction } from './types'
import { SPECIAL_DESTINATIONS } from './specialDestinations'

// Lógica pura de la revisión (#321): sugerencias, siguiente pendiente y relleno con precio de mercado.

/**
 * Destino recordado de cada retiro aún sin asignar (por activo y cuenta). Es una
 * sugerencia: no cuenta como asignado. Se descarta si apunta a una wallet que ya no existe.
 */
export function sugerenciasPendientes(
  txs: readonly PreviewTransaction[],
  destinations: Record<string, string>,
  memoria: Record<string, string>,
  walletIds: readonly string[],
  key: (tx: PreviewTransaction) => string,
): Record<string, string> {
  const validos = new Set<string>([...SPECIAL_DESTINATIONS.map(s => s.id), ...walletIds])
  const out: Record<string, string> = {}
  for (const tx of txs) {
    const k = key(tx)
    if (destinations[k]) continue
    const dest = memoria[`${tx.asset}|${tx.account}`]
    if (dest && validos.has(dest)) out[k] = dest
  }
  return out
}

/** Siguiente elemento pendiente después de `actual` (dando la vuelta); null si no queda ninguno. */
export function siguientePendiente(items: readonly { id: string; pendiente: boolean }[], actual: string | null): string | null {
  const pendientes = items.filter(i => i.pendiente)
  if (pendientes.length === 0) return null
  const desde = actual ? items.findIndex(i => i.id === actual) : -1
  return items.slice(desde + 1).find(i => i.pendiente)?.id ?? pendientes[0].id
}

/** Coste con el precio de mercado del día para los depósitos sin revisar que lo tienen. */
export function rellenoConMercado(deposits: readonly DepositReview[], costs: Record<string, number | null>): Record<string, number> {
  const out: Record<string, number> = {}
  for (const d of deposits) {
    if (d.txKey in costs) continue
    if (d.historicalPrice != null && d.historicalPrice > 0) out[d.txKey] = d.historicalPrice
  }
  return out
}

// Ids de los elementos revisables, para saltar al siguiente pendiente.
const seguro = (v: string) => v.replace(/[^A-Za-z0-9_-]/g, '')
export const idDireccion = (clave: string) => `rev-dir-${seguro(clave)}`
export const idActivo = (asset: string) => `rev-act-${seguro(asset)}`
export const idDeposito = (key: string) => `rev-dep-${seguro(key)}`
