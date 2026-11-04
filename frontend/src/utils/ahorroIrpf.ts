// Ahorro de IRPF de las pérdidas sugeridas en Planificar (#533). Funciones puras.
//
// Las cuotas las calcula el backend para una lista de ganancias (o pérdidas)
// adicionales. Con precios en vivo la pérdida de cada sugerencia cambia sin
// parar, así que se piden al euro y solo las que aún no están en la caché: así
// nunca se queda una sugerencia sin dato ni hay una petición en cada tic.

/** Máximo de importes por petición (límite de la API, `cuotasSchema`). */
export const MAX_POR_PETICION = 200

/** Importe de una sugerencia redondeado al euro: la clave de la caché. */
export const claveImporte = (pnl: number): number => Math.round(pnl)

/** Importes que faltan en la caché, sin repetir y ordenados (clave estable de la consulta). */
export function importesPendientes(pnls: readonly number[], cache: ReadonlyMap<number, number>): number[] {
  const faltan = new Set<number>()
  for (const p of pnls) {
    const k = claveImporte(p)
    if (!cache.has(k)) faltan.add(k)
  }
  return [...faltan].sort((a, b) => a - b)
}

/** Trozos de como mucho `max` elementos, para no pasar del límite de la API. */
export function trocear<T>(items: readonly T[], max = MAX_POR_PETICION): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += max) out.push(items.slice(i, i + max))
  return out
}

/**
 * Ahorro de IRPF de realizar esa pérdida: cuota sin ella menos cuota con ella,
 * nunca negativo. null si su importe aún no está calculado.
 */
export function ahorroDe(pnl: number, cuotaBase: number | null, cache: ReadonlyMap<number, number>): number | null {
  if (cuotaBase === null) return null
  const cuota = cache.get(claveImporte(pnl))
  return cuota === undefined ? null : Math.max(0, cuotaBase - cuota)
}
