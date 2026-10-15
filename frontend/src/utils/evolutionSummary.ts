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

/** Máximo de marcadores: en periodos largos, más saturarían la curva. */
export const MAX_FLOW_MARKERS = 24

/**
 * Puntos con depósitos o retiradas de capital propio, para marcarlos sobre la
 * curva. Si hay más de `max`, se quedan los de mayor importe (cada uno en su
 * día exacto), en orden cronológico.
 */
export function flowMarkers(points: readonly EvolutionPoint[], max = MAX_FLOW_MARKERS): EvolutionPoint[] {
  const flows = points.filter(p => Math.abs(p.flow) >= 0.01)
  if (flows.length <= max) return flows
  return [...flows].sort((a, b) => Math.abs(b.flow) - Math.abs(a.flow)).slice(0, max).sort((a, b) => a.x - b.x)
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
