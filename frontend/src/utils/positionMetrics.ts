import type { CryptoRow, UnifiedRow } from './assetTable'
import type { RealizedByAsset } from '../api/portfolio'
import { daysSince } from './portfolioLots'

// Métricas derivadas de cada posición para las columnas nuevas de la tabla
// (#527). Funciones puras: la tabla las calcula una vez y las usan las celdas,
// el orden y los totales.

export type CategoriaRealizado = RealizedByAsset['categoria']

/** Parte del realizado de un activo, en la moneda mostrada. */
export interface ParteRealizado {
  categoria: CategoriaRealizado
  value: number
  operations: number
}

export const CATEGORIA_LABEL: Record<CategoriaRealizado, string> = {
  ventas: 'Ventas',
  permutas: 'Permutas (pagos con este activo)',
  comisiones: 'Comisiones pagadas con este activo',
  otros: 'Otras (pérdidas, devolución de margen...)',
}
const ORDEN_CATEGORIAS: readonly CategoriaRealizado[] = ['ventas', 'permutas', 'comisiones', 'otros']

/** Agrupa las filas de la API por activo, en EUR. */
export function realizadoPorActivo(rows: readonly RealizedByAsset[]): Map<string, { categoria: CategoriaRealizado; eur: number; operations: number }[]> {
  const out = new Map<string, { categoria: CategoriaRealizado; eur: number; operations: number }[]>()
  for (const r of rows) {
    const list = out.get(r.asset) ?? []
    list.push({ categoria: r.categoria, eur: r.net_eur, operations: r.operations })
    out.set(r.asset, list)
  }
  for (const list of out.values()) list.sort((a, b) => ORDEN_CATEGORIAS.indexOf(a.categoria) - ORDEN_CATEGORIAS.indexOf(b.categoria))
  return out
}

export interface RowMetrics {
  /** No realizado más realizado, en la moneda mostrada; null sin precio. */
  resultado: number | null
  /** Lo no realizado (valor menos coste), en la moneda mostrada; null sin precio. */
  noRealizado: number | null
  /** Realizado (ventas, permutas, comisiones...), en la moneda mostrada (0 si no hubo). */
  realizado: number
  /** Desglose del realizado por tipo de operación. */
  realizadoPartes: ParteRealizado[]
  /** Días desde la compra abierta más antigua. */
  ageDays: number | null
  /** Distancia (%) al cierre más alto de 90 días y ese máximo en la moneda mostrada. */
  desdeMaximo: { pct: number; max: number } | null
  /** Rentas recibidas del activo en la moneda mostrada. */
  ingresos: { value: number; operations: number } | null
}

export interface MetricsContext {
  /** Precio en vivo en la moneda mostrada. */
  prices: Readonly<Record<string, number>>
  /** Precio en vivo en EUR (base de los cierres). */
  pricesEur: Readonly<Record<string, number>>
  /** EUR a la moneda mostrada (1 en EUR); null sin tipo. */
  rate: number | null
  /** Realizado por activo y tipo, en EUR (ver realizadoPorActivo). */
  realizadoEur?: ReadonlyMap<string, readonly { categoria: CategoriaRealizado; eur: number; operations: number }[]>
  /** Rentas por activo, en EUR al recibirlas. */
  ingresosEur?: ReadonlyMap<string, { total: number; operations: number }>
  /** Cierres diarios en EUR de los últimos 90 días. */
  cierres90?: Readonly<Record<string, ReadonlyArray<{ price: number }>>>
  now?: Date
}

/** Distancia (%) del precio en vivo al máximo de los cierres y el propio en vivo; null sin datos. */
export function desdeMaximo(cierresEur: ReadonlyArray<{ price: number }> | undefined, liveEur: number | undefined): { pct: number; maxEur: number } | null {
  if (!liveEur || !(liveEur > 0) || !cierresEur || cierresEur.length === 0) return null
  const maxEur = Math.max(liveEur, ...cierresEur.map(c => c.price).filter(p => p > 0))
  return { pct: (liveEur / maxEur - 1) * 100, maxEur }
}

export function rowMetrics(row: CryptoRow, ctx: MetricsContext): RowMetrics {
  const price = ctx.prices[row.asset] ?? 0
  const rate = ctx.rate
  const partes = rate === null ? [] : (ctx.realizadoEur?.get(row.asset) ?? []).map(p => ({ categoria: p.categoria, value: p.eur * rate, operations: p.operations }))
  const realizado = partes.reduce((s, p) => s + p.value, 0)
  const noRealizado = price > 0 ? row.value - row.totalCostBasis : null
  const resultado = noRealizado !== null && rate !== null ? noRealizado + realizado : null
  const max = desdeMaximo(ctx.cierres90?.[row.asset], ctx.pricesEur[row.asset])
  const ing = ctx.ingresosEur?.get(row.asset)
  return {
    resultado,
    noRealizado,
    realizado,
    realizadoPartes: partes,
    ageDays: daysSince(row.firstOpenedAt ?? null, ctx.now),
    desdeMaximo: max && rate !== null ? { pct: max.pct, max: max.maxEur * rate } : null,
    ingresos: ing && rate !== null ? { value: ing.total * rate, operations: ing.operations } : null,
  }
}

export function metricsByAsset(rows: readonly UnifiedRow[], ctx: MetricsContext): Map<string, RowMetrics> {
  const out = new Map<string, RowMetrics>()
  for (const r of rows) if (r.kind === 'crypto') out.set(r.asset, rowMetrics(r, ctx))
  return out
}

export interface ColumnTotals {
  coste: number
  resultado: number | null
  ingresos: number | null
}

/** Totales de las columnas nuevas sobre las filas visibles; null si ninguna fila aporta dato. */
export function columnTotals(rows: readonly UnifiedRow[], metrics: ReadonlyMap<string, RowMetrics>): ColumnTotals {
  let coste = 0
  let resultado: number | null = null
  let ingresos: number | null = null
  for (const r of rows) {
    if (r.kind !== 'crypto') continue
    coste += r.totalCostBasis
    const m = metrics.get(r.asset)
    if (m?.resultado != null) resultado = (resultado ?? 0) + m.resultado
    if (m?.ingresos) ingresos = (ingresos ?? 0) + m.ingresos.value
  }
  return { coste, resultado, ingresos }
}

/**
 * Geometría de la barra de break-even «hacia el coste» (#527): en una escala
 * de 0 al mayor de los dos precios, la marca del coste y el punto del precio
 * actual; la barra une ambos. Posiciones de 0 a 1.
 */
export function breakEvenBar(price: number, avgPrice: number): { cost: number; price: number; up: boolean } | null {
  if (!(price > 0) || !(avgPrice > 0)) return null
  const top = Math.max(price, avgPrice)
  return { cost: avgPrice / top, price: price / top, up: price >= avgPrice }
}

/** Antigüedad compacta para la celda: «12 d», «5 m», «2 a 3 m». */
export function edadCorta(days: number): string {
  if (days < 31) return `${days} d`
  const months = Math.floor((days * 12) / 365 + 1e-9)
  if (months < 12) return `${months} m`
  const years = Math.floor(months / 12)
  const rest = months % 12
  return rest > 0 ? `${years} a ${rest} m` : `${years} a`
}
