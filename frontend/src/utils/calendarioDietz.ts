import type { CalendarDay, YearMonth } from './pnlCalendar'

// Rentabilidad de un mes, de un año o de cualquier tramo por Dietz modificado
// (#512), calculada en el cliente sobre la historia diaria con las mismas
// reglas que computeDailyPnl del backend (backend/src/modules/pnl/dailyPnl.ts):
//   Dietz = P&L del tramo / (V0 + Σ Fₖ · (m − k)/m)
// con V0 el valor al cierre del día anterior al tramo, Fₖ el flujo neto del
// día k (entradas menos salidas) y m los días del tramo; si la base no llega
// al umbral de capital ínfimo (1 % del valor máximo, mínimo 1) se queda en 0.
// A diferencia del TWR encadenado, pondera por el capital: con depósitos o
// retiradas en el mes, el % ya no puede tener signo distinto al importe por
// pesar igual un día con poco dinero que otro con mucho. Funciones puras.

export const MIN_BASE_SHARE = 0.01
export const MIN_BASE_ABS = 1

/** Día con lo necesario para el Dietz: su valor al cierre y sus flujos. */
export interface DiaValorado extends CalendarDay {
  value: number
  inflow: number
  outflow: number
}

const round2 = (n: number) => Math.round(n * 100) / 100
const round4 = (n: number) => Math.round(n * 10_000) / 10_000

/** Dietz modificado de los días dados (consecutivos) con el valor previo; 0 si la base es ínfima. */
export function dietzModificado(previousValue: number, days: readonly DiaValorado[]): number {
  const threshold = Math.max(MIN_BASE_ABS, days.reduce((m, d) => Math.max(m, d.value), previousValue) * MIN_BASE_SHARE)
  let total = 0
  let sumFlows = 0
  let sumIndexed = 0
  let dietz = 0
  days.forEach((d, i) => {
    const m = i + 1
    const flow = d.inflow - d.outflow
    total += d.pnl
    sumFlows += flow
    sumIndexed += m * flow
    const base = previousValue + (m * sumFlows - sumIndexed) / m
    if (base >= threshold) dietz = (total / base) * 100
  })
  return round4(dietz)
}

export interface TotalTramo {
  pnl: number
  /** Dietz modificado del tramo. */
  pct: number
  /** Días con dato (cerrados o en curso). */
  dias: number
  /** Incluye el día en curso. */
  enCurso: boolean
}

/** Total de [from, to] sobre la historia completa (ordenada): P&L sumado y Dietz con el valor del día anterior. */
export function totalTramo(historia: readonly DiaValorado[], from: string, to: string): TotalTramo | null {
  const i0 = historia.findIndex(d => d.date >= from)
  if (i0 === -1) return null
  const tramo: DiaValorado[] = []
  for (let i = i0; i < historia.length && historia[i].date <= to; i++) tramo.push(historia[i])
  const conDato = tramo.filter(d => d.complete || d.live)
  if (conDato.length === 0) return null
  const previo = i0 > 0 ? historia[i0 - 1].value : 0
  return {
    pnl: round2(conDato.reduce((s, d) => s + d.pnl, 0)),
    pct: dietzModificado(previo, tramo),
    dias: conDato.length,
    enCurso: conDato.some(d => d.live),
  }
}

const pad = (n: number) => String(n).padStart(2, '0')
const ultimoDia = ({ year, month }: YearMonth) => new Date(Date.UTC(year, month, 0)).getUTCDate()

/** Total de un mes con su Dietz. */
export function totalMes(historia: readonly DiaValorado[], ym: YearMonth): TotalTramo | null {
  const p = `${ym.year}-${pad(ym.month)}`
  return totalTramo(historia, `${p}-01`, `${p}-${pad(ultimoDia(ym))}`)
}

export interface TotalMesAnio extends TotalTramo {
  ym: YearMonth
  /** P&L de cada día del mes (índice 0 = día 1); null sin dato. Para la mini tira de barras. */
  diarios: Array<number | null>
}

/** Los 12 meses de un año con su total, su Dietz y sus días; null en los meses sin datos. */
export function totalesAnio(historia: readonly DiaValorado[], year: number): Array<TotalMesAnio | null> {
  return Array.from({ length: 12 }, (_, i) => {
    const ym = { year, month: i + 1 }
    const total = totalMes(historia, ym)
    if (!total) return null
    const prefijo = `${year}-${pad(i + 1)}-`
    const diarios: Array<number | null> = Array.from({ length: ultimoDia(ym) }, () => null)
    for (const d of historia) {
      if (d.date.startsWith(prefijo) && (d.complete || d.live)) diarios[Number(d.date.slice(8)) - 1] = d.pnl
    }
    return { ...total, ym, diarios }
  })
}

/** Índices del mejor y el peor mes del año por importe (solo si ganan o pierden). */
export function extremosAnio(meses: ReadonlyArray<TotalMesAnio | null>): { mejor: number | null; peor: number | null } {
  let mejor: number | null = null
  let peor: number | null = null
  meses.forEach((m, i) => {
    if (!m) return
    if (m.pnl > 0 && (mejor === null || m.pnl > (meses[mejor]?.pnl ?? 0))) mejor = i
    if (m.pnl < 0 && (peor === null || m.pnl < (meses[peor]?.pnl ?? 0))) peor = i
  })
  return { mejor, peor }
}
