import type { AssetSale } from '../api/portfolio'

// Gráfico de precio y rentabilidad total del panel de detalle (#284).
// Funciones puras: serie, rango «Todo», máximo/mínimo, variación, marcas de
// compras y ventas agrupadas por día y rentabilidad total.
//
// Los cierres se guardan en EUR; en USD se convierten al cambio en vivo, igual
// que el mini-gráfico de la tabla (#282). Es una aproximación para los días
// pasados; el último punto (precio en vivo) es exacto.

export type ChartRange = '30d' | '90d' | '1y' | 'all'
export const MAX_CHART_DAYS = 400
const RANGE_DAYS: Record<Exclude<ChartRange, 'all'>, number> = { '30d': 30, '90d': 90, '1y': 365 }
const DAY_MS = 86_400_000

export interface ChartPoint { t: number; price: number }
export interface ChartMarker { t: number; price: number; quantity: number; kind: 'compra' | 'venta' }

/** Días a pedir para un rango; «Todo» va desde la primera compra abierta (máx. 400). */
export function rangeDays(range: ChartRange, firstOpenedAt: string | null, now: Date = new Date()): number {
  if (range !== 'all') return RANGE_DAYS[range]
  if (!firstOpenedAt) return RANGE_DAYS['1y']
  const days = Math.ceil((now.getTime() - Date.parse(firstOpenedAt)) / DAY_MS) + 1
  return Math.min(MAX_CHART_DAYS, Math.max(2, days))
}

/** Mediodía UTC del día: centra el punto del cierre en su fecha. */
const dayT = (date: string) => Date.parse(`${date}T12:00:00Z`)

/** Serie en la moneda elegida: cierres diarios + precio en vivo como último punto. */
export function priceSeries(
  closesEur: ReadonlyArray<{ date: string; price: number }>,
  livePriceEur: number | undefined,
  eurToDisplay: number,
  now: Date = new Date(),
): ChartPoint[] {
  const out = closesEur.map(c => ({ t: dayT(c.date), price: c.price * eurToDisplay }))
  if (livePriceEur && livePriceEur > 0) out.push({ t: now.getTime(), price: livePriceEur * eurToDisplay })
  return out
}

export interface RangeStats { max: ChartPoint; min: ChartPoint; changePct: number | null }

/** Máximo, mínimo y variación entre el primer y el último punto. */
export function rangeStats(points: readonly ChartPoint[]): RangeStats | null {
  if (points.length < 2) return null
  let max = points[0], min = points[0]
  for (const p of points) {
    if (p.price > max.price) max = p
    if (p.price < min.price) min = p
  }
  const first = points[0].price
  const last = points[points.length - 1].price
  return { max, min, changePct: first > 0 ? ((last - first) / first) * 100 : null }
}

const dayKey = (iso: string) => iso.slice(0, 10)

/**
 * Marcas del gráfico dentro del rango, una por día y tipo: cantidad sumada y
 * precio medio ponderado. Las compras usan el coste unitario del lote ya en la
 * moneda elegida; las ventas, su precio en EUR al cambio en vivo.
 */
export function chartMarkers(
  buys: ReadonlyArray<{ openedAt: string; quantity: number; unitCost: number }>,
  sales: readonly AssetSale[],
  fromT: number,
  eurToDisplay: number,
): ChartMarker[] {
  const groups = new Map<string, { kind: ChartMarker['kind']; day: string; qty: number; amount: number }>()
  const add = (kind: ChartMarker['kind'], iso: string, qty: number, price: number) => {
    if (qty <= 0 || price <= 0) return
    const key = `${kind}|${dayKey(iso)}`
    const g = groups.get(key) ?? { kind, day: dayKey(iso), qty: 0, amount: 0 }
    g.qty += qty
    g.amount += qty * price
    groups.set(key, g)
  }
  for (const b of buys) add('compra', b.openedAt, b.quantity, b.unitCost)
  for (const s of sales) add('venta', s.soldAt, s.quantity, s.priceEur * eurToDisplay)
  return [...groups.values()]
    .map(g => ({ t: dayT(g.day), price: g.amount / g.qty, quantity: g.qty, kind: g.kind }))
    .filter(m => m.t >= fromT - DAY_MS / 2)
    .sort((a, b) => a.t - b.t)
}

export interface TotalReturn { realized: number; unrealized: number | null; total: number | null }

/** Realizado (fiscal, en EUR, al cambio en vivo) + no realizado = total. */
export function totalReturn(realizedEur: number, unrealized: number | null, eurToDisplay: number): TotalReturn {
  const realized = realizedEur * eurToDisplay
  return { realized, unrealized, total: unrealized === null ? null : realized + unrealized }
}

/** Etiqueta corta para el eje: 3 cifras significativas por debajo de 1, 2 decimales hasta 100 y enteros por encima. */
export function axisPrice(v: number, currency: 'EUR' | 'USD'): string {
  const abs = Math.abs(v)
  const opts: Intl.NumberFormatOptions = abs >= 100 ? { maximumFractionDigits: 0 }
    : abs >= 1 ? { minimumFractionDigits: 2, maximumFractionDigits: 2 }
    : { maximumSignificantDigits: 3 }
  return `${new Intl.NumberFormat('es-ES', opts).format(v)} ${currency === 'USD' ? '$' : '€'}`
}

/** Dónde colocar la etiqueta de un punto para que no se corte en los bordes del gráfico. */
export function labelSide(t: number, fromT: number, toT: number): 'left' | 'right' | 'center' {
  const span = toT - fromT
  if (span <= 0) return 'center'
  const x = (t - fromT) / span
  return x < 0.15 ? 'right' : x > 0.85 ? 'left' : 'center'
}
