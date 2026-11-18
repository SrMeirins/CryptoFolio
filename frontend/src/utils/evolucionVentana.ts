import type { EvolutionPoint } from './evolutionSeries'

// Ventana visible del gráfico de evolución (#509). Se carga toda la historia
// una vez y el zoom solo elige qué tramo se ve; el P&L y el % de la ventana se
// recalculan aquí con las mismas reglas que el servidor (computeDailyPnl de
// backend/src/modules/pnl/dailyPnl.ts): P&L acumulado desde el inicio del
// tramo y % sobre el máximo capital neto aportado, que parte del valor del
// día anterior y suma depósitos menos retiradas; con una base por debajo del
// umbral (1 % del máximo, mínimo 1) el % no cambia. Funciones puras.

export const MIN_BASE_SHARE = 0.01
export const MIN_BASE_ABS = 1
/** Por debajo de este valor no hay posiciones: el tramo se sombrea y no cuenta. */
export const SIN_POSICIONES = 0.01

const round2 = (n: number) => Math.round(n * 100) / 100
const round4 = (n: number) => Math.round(n * 10_000) / 10_000

/** Punto de la ventana con el capital neto aportado acumulado (línea de aportado). */
export interface PuntoVentana extends EvolutionPoint {
  aportado: number
  /** Sin posiciones ese día: la curva no se dibuja y no cuenta en las métricas. */
  vacio: boolean
}

/**
 * Puntos de [from, to] con el P&L y el % recalculados desde el inicio del
 * tramo. Sin punto anterior (el tramo empieza con la historia), el valor de
 * partida es 0, como en «Todo».
 */
export function rebasarVentana(points: readonly EvolutionPoint[], from: number, to: number): PuntoVentana[] {
  const i0 = points.findIndex(p => p.x >= from)
  if (i0 === -1) return []
  let i1 = points.length - 1
  while (i1 >= i0 && points[i1].x > to) i1--
  if (i1 < i0) return []
  const prev = i0 > 0 ? points[i0 - 1] : null
  const previousValue = prev?.value ?? 0
  const tramo = points.slice(i0, i1 + 1)
  const threshold = Math.max(MIN_BASE_ABS, tramo.reduce((m, p) => Math.max(m, p.value), previousValue) * MIN_BASE_SHARE)
  let prevPnl = prev?.pnl ?? 0
  let pnl = 0
  let netCapital = previousValue
  let peak = previousValue
  let pct = 0
  return tramo.map(p => {
    pnl += p.pnl - prevPnl
    prevPnl = p.pnl
    netCapital += p.deposit - p.withdrawal
    peak = Math.max(peak, netCapital)
    if (peak >= threshold) pct = (pnl / peak) * 100
    return { ...p, pnl: round2(pnl), pct: round4(pct), aportado: round2(netCapital), vacio: p.value < SIN_POSICIONES }
  })
}

/** Tramos seguidos sin posiciones, como [desde, hasta] en ms, para sombrearlos. */
export function tramosSinPosiciones(points: readonly PuntoVentana[]): Array<{ from: number; to: number }> {
  const out: Array<{ from: number; to: number }> = []
  points.forEach((p, i) => {
    if (!p.vacio) return
    if (i > 0 && points[i - 1].vacio) out[out.length - 1].to = p.x
    else out.push({ from: p.x, to: p.x })
  })
  return out
}

export interface Extremo { valor: number; x: number }

export interface MetricasVentana {
  /** Variación del valor de la cartera entre el primer y el último punto con posiciones. */
  variacionValor: number
  variacionPct: number | null
  maximo: Extremo | null
  minimo: Extremo | null
  /** Depósitos menos retiradas de capital propio en el tramo. */
  aportadoNeto: number
}

/** Métricas de la tira (#509), sin contar los días sin posiciones. */
export function metricasVentana(points: readonly PuntoVentana[]): MetricasVentana | null {
  const con = points.filter(p => !p.vacio)
  if (con.length === 0) return null
  const first = con[0]
  const last = con[con.length - 1]
  const maximo = con.reduce((m, p) => (p.value > m.value ? p : m))
  const minimo = con.reduce((m, p) => (p.value < m.value ? p : m))
  const aportadoNeto = points.reduce((s, p) => s + p.deposit - p.withdrawal, 0)
  return {
    variacionValor: round2(last.value - first.value),
    // Con un valor de partida ínfimo (cartera casi vacía) el % no tiene sentido: mismo umbral que el resto.
    variacionPct: first.value >= Math.max(MIN_BASE_ABS, maximo.value * MIN_BASE_SHARE)
      ? round4(((last.value - first.value) / first.value) * 100) : null,
    maximo: { valor: maximo.value, x: maximo.x },
    minimo: { valor: minimo.value, x: minimo.x },
    aportadoNeto: round2(aportadoNeto),
  }
}
