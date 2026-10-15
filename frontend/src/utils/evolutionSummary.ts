import type { PnlMetric } from './pnlChart'
import type { EvolutionPoint } from './evolutionSeries'

// Resumen del periodo del gráfico de evolución (#214): rentabilidad y P&L,
// mejor y peor día (u hora en 24H), máxima caída y marcadores de depósitos y
// retiradas. Funciones puras; el componente solo las pinta.

const HOUR_MS = 3_600_000
const round2 = (n: number) => Math.round(n * 100) / 100

export interface Extreme {
  x: number      // día (o inicio de la hora en 24H)
  pct: number
  pnl: number
}

export interface Drawdown {
  pct: number    // caída desde el máximo (negativa)
  fromX: number  // máximo previo
  toX: number    // mínimo
}

export interface PeriodSummary {
  pct: number
  pnl: number
  best: Extreme | null
  worst: Extreme | null
  drawdown: Drawdown | null
}

/** Rentabilidad y P&L de cada día; en 24H, de cada hora (tramos de 15 min encadenados). */
function periods(points: readonly EvolutionPoint[], intraday: boolean): Extreme[] {
  const steps = points.map((p, i) => ({ x: p.x, pct: p.stepPct, pnl: p.pnl - (i > 0 ? points[i - 1].pnl : 0) }))
  if (!intraday) {
    return steps.filter(s => s.pct !== null).map(s => ({ x: s.x, pct: s.pct as number, pnl: round2(s.pnl) }))
  }
  // Un punto cierra el tramo de 15 min anterior: el de las 15:00 pertenece a la hora de las 14:00.
  const hours = new Map<number, { growth: number; pnl: number }>()
  for (const s of steps.slice(1)) {
    if (s.pct === null) continue
    const hour = Math.floor((s.x - 1) / HOUR_MS) * HOUR_MS
    const h = hours.get(hour) ?? { growth: 1, pnl: 0 }
    hours.set(hour, { growth: h.growth * (1 + s.pct / 100), pnl: h.pnl + s.pnl })
  }
  return [...hours].map(([x, h]) => ({ x, pct: (h.growth - 1) * 100, pnl: round2(h.pnl) }))
}

/**
 * Mayor caída desde un máximo del índice de rentabilidad (encadenando la de
 * cada día o tramo): los depósitos y retiradas no la alteran. null si no cae.
 */
export function maxDrawdown(points: readonly EvolutionPoint[]): Drawdown | null {
  let index = 1
  let peak = 1
  let peakX = points[0]?.x ?? 0
  let worst: Drawdown | null = null
  for (const p of points) {
    if (p.stepPct !== null) index *= 1 + p.stepPct / 100
    if (index > peak) { peak = index; peakX = p.x }
    const dd = (index / peak - 1) * 100
    if (dd < -0.005 && (!worst || dd < worst.pct)) worst = { pct: dd, fromX: peakX, toX: p.x }
  }
  return worst
}

export function periodSummary(points: readonly EvolutionPoint[], intraday: boolean): PeriodSummary | null {
  const last = points[points.length - 1]
  if (!last) return null
  const list = periods(points, intraday)
  const best = list.reduce<Extreme | null>((b, p) => (!b || p.pct > b.pct ? p : b), null)
  const worst = list.reduce<Extreme | null>((w, p) => (!w || p.pct < w.pct ? p : w), null)
  return {
    pct: last.pct,
    pnl: last.pnl,
    best: best && best.pct > 0 ? best : null,
    worst: worst && worst.pct < 0 ? worst : null,
    drawdown: maxDrawdown(points),
  }
}

export type FlowUnit = 'day' | 'week' | 'month'

/** Grupo de depósitos y retiradas que se marca sobre la curva. */
export interface FlowBucket {
  unit: FlowUnit
  start: number        // inicio del grupo (día, lunes o día 1 del mes, ms UTC)
  anchor: EvolutionPoint  // punto de la curva donde se dibuja: el de mayor movimiento del grupo
  deposits: number
  withdrawals: number  // positivo
  days: number         // días (o tramos) con algún movimiento
}

const DAY_MS = 86_400_000

/** Granularidad de los marcadores según la duración: un marcador por día hasta ~6 meses; luego por semana o mes. */
export function flowUnit(points: readonly EvolutionPoint[], intraday: boolean): FlowUnit {
  if (intraday || points.length < 2) return 'day'
  const spanDays = (points[points.length - 1].x - points[0].x) / DAY_MS
  return spanDays <= 200 ? 'day' : spanDays <= 400 ? 'week' : 'month'
}

function bucketStart(x: number, unit: FlowUnit): number {
  if (unit === 'day') return x
  const d = new Date(x)
  if (unit === 'month') return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)
  const weekday = (d.getUTCDay() + 6) % 7
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - weekday)
}

/**
 * Depósitos y retiradas de capital propio agrupados para marcarlos sobre la
 * curva. Nunca descarta movimientos: en periodos largos los agrupa por semana
 * o mes (antes se mostraban solo los 24 mayores y la suma no cuadraba con la
 * tarjeta «EUR neto»), y conserva entradas y salidas por separado.
 */
export function flowBuckets(points: readonly EvolutionPoint[], intraday: boolean): FlowBucket[] {
  const unit = flowUnit(points, intraday)
  const buckets = new Map<number, FlowBucket>()
  for (const p of points) {
    if (p.deposit < 0.01 && p.withdrawal < 0.01) continue
    const start = bucketStart(p.x, unit)
    const b = buckets.get(start)
    if (!b) {
      buckets.set(start, { unit, start, anchor: p, deposits: p.deposit, withdrawals: p.withdrawal, days: 1 })
      continue
    }
    if (p.deposit + p.withdrawal > b.anchor.deposit + b.anchor.withdrawal) b.anchor = p
    b.deposits += p.deposit
    b.withdrawals += p.withdrawal
    b.days += 1
  }
  return [...buckets.values()].map(b => ({ ...b, deposits: round2(b.deposits), withdrawals: round2(b.withdrawals) }))
}

/**
 * Sustituye el día de hoy por el cálculo en vivo (#213), para que el final de
 * la curva se mueva con los precios. Conserva la métrica del periodo: en TWR
 * encadena la rentabilidad de hoy; sobre capital aportado escala el % del
 * servidor por la proporción entre el P&L en vivo y el del servidor.
 */
export function applyLiveToday(
  points: readonly EvolutionPoint[],
  live: { value: number; pnl: number; pct: number | null } | null,
  metric: PnlMetric,
): EvolutionPoint[] {
  const last = points[points.length - 1]
  if (!live || !last?.live) return [...points]
  const prev = points.length > 1 ? points[points.length - 2] : null
  const prevPnl = prev?.pnl ?? 0
  const pnl = round2(prevPnl + live.pnl)
  const pct = metric === 'twr'
    ? ((1 + (prev?.pct ?? 0) / 100) * (1 + (live.pct ?? 0) / 100) - 1) * 100
    : Math.abs(last.pnl) >= 1 ? last.pct * (pnl / last.pnl) : last.pct
  return [...points.slice(0, -1), { ...last, value: live.value, pnl, pct, stepPct: live.pct }]
}
