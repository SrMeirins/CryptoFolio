import { zonedFormat } from './zonedFormat'
// Marcas de los ejes del gráfico de evolución del Dashboard (#212). Funciones
// puras para que ambas pestañas (P&L y Valor) usen el mismo criterio:
//
// - Eje de fechas numérico (milisegundos UTC del día): la distancia entre
//   puntos es la real, aunque los datos no sean diarios (p. ej. semanales).
// - Marcas alineadas al calendario según la duración de los datos: cada día,
//   cada lunes, el día 1 de cada mes, cada dos meses, cada trimestre o cada
//   año. Una marca por unidad, así que ninguna etiqueta se repite.
// - Eje de valores con números «redondos» (1, 2, 2,5 o 5 × 10ⁿ) equiespaciados.

export type TickUnit = 'hour3' | 'day' | 'monday' | 'month' | 'month2' | 'quarter' | 'year'

const DAY_MS = 86_400_000

/** "YYYY-MM-DD" → milisegundos UTC a medianoche. */
export function dayMs(date: string): number {
  const [y, m, d] = date.split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}

/** Unidad de las marcas según los días que abarcan los datos. */
export function tickUnit(spanDays: number): TickUnit {
  if (spanDays <= 10) return 'day'
  if (spanDays <= 45) return 'monday'
  if (spanDays <= 200) return 'month'
  if (spanDays <= 400) return 'month2'
  if (spanDays <= 3 * 366) return 'quarter'
  return 'year'
}

const HOUR_MS = 3_600_000
const LOCAL_HOUR = () => zonedFormat('es-ES', { hour: 'numeric', hourCycle: 'h23' })

/** Marcas (ms UTC) de la unidad dentro de [from, to], ambos incluidos. */
export function timeTicks(from: number, to: number, unit: TickUnit): number[] {
  const ticks: number[] = []
  if (unit === 'hour3') {
    // Horas en punto múltiplos de 3 en hora de Madrid (00:00, 03:00, …), también con cambio de horario.
    for (let t = Math.ceil(from / HOUR_MS) * HOUR_MS; t <= to; t += HOUR_MS) {
      if (Number(LOCAL_HOUR().format(new Date(t))) % 3 === 0) ticks.push(t)
    }
    return ticks
  }
  const start = new Date(from)
  if (unit === 'day' || unit === 'monday') {
    let t = from
    if (unit === 'monday') t += ((8 - start.getUTCDay()) % 7) * DAY_MS
    for (; t <= to; t += unit === 'day' ? DAY_MS : 7 * DAY_MS) ticks.push(t)
    return ticks
  }
  const step = unit === 'month' ? 1 : unit === 'month2' ? 2 : unit === 'quarter' ? 3 : 12
  let year = start.getUTCFullYear()
  let month = start.getUTCMonth()
  // Primer múltiplo de la unidad desde el inicio (meses pares, trimestres o enero).
  if (step > 1) month = Math.ceil(month / step) * step
  let t = Date.UTC(year, month, 1)
  if (t < from) { month += step; t = Date.UTC(year, month, 1) }
  while (t <= to) {
    ticks.push(t)
    month += step
    if (month >= 12) { year += Math.floor(month / 12); month %= 12 }
    t = Date.UTC(year, month, 1)
  }
  return ticks
}

const DAY_FMT = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', timeZone: 'UTC' })
const TIME_FMT = () => zonedFormat('es-ES', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
const MONTH_FMT = new Intl.DateTimeFormat('es-ES', { month: 'short', year: '2-digit', timeZone: 'UTC' })

/** Etiqueta de una marca según la granularidad: «15:00», «15 oct», «oct 26» o «2026». */
export function formatTick(ms: number, unit: TickUnit): string {
  if (unit === 'hour3') return TIME_FMT().format(new Date(ms))
  if (unit === 'year') return String(new Date(ms).getUTCFullYear())
  const fmt = unit === 'day' || unit === 'monday' ? DAY_FMT : MONTH_FMT
  return fmt.format(new Date(ms)).replace('.', '')
}

/** Paso «redondo» (1, 2, 2,5 o 5 × 10ⁿ) para repartir `range` en unas `target` divisiones. */
function niceStep(range: number, target: number): number {
  const raw = range / target
  const magnitude = 10 ** Math.floor(Math.log10(raw))
  const residual = raw / magnitude
  const nice = residual <= 1 ? 1 : residual <= 2 ? 2 : residual <= 2.5 ? 2.5 : residual <= 5 ? 5 : 10
  return nice * magnitude
}

/**
 * Marcas equiespaciadas con valores redondos que cubren [min, max]. Con
 * `includeZero` el 0 siempre es una de las marcas (eje de P&L).
 */
export function niceTicks(min: number, max: number, target = 4, includeZero = false): number[] {
  let lo = includeZero ? Math.min(min, 0) : min
  let hi = includeZero ? Math.max(max, 0) : max
  if (lo === hi) { const pad = Math.abs(lo) * 0.05 || 1; lo -= pad; hi += pad }
  const step = niceStep(hi - lo, target)
  const first = Math.floor(lo / step) * step
  const last = Math.ceil(hi / step) * step
  const ticks: number[] = []
  // Redondeo a la precisión del paso para evitar 0,30000000000000004.
  const decimals = Math.max(0, -Math.floor(Math.log10(step)) + 1)
  for (let v = first; v <= last + step / 2; v += step) ticks.push(Number(v.toFixed(decimals)) + 0)
  return ticks
}

/** Decimales necesarios para mostrar las marcas sin repetir etiquetas (p. ej. 0,5 → 1). */
export function tickDecimals(ticks: readonly number[]): number {
  if (ticks.length < 2) return 0
  const step = Math.abs(ticks[1] - ticks[0])
  // Mínimos decimales que representan el paso exacto (0,25 → 2; 0,5 → 1; 10 → 0).
  for (let d = 0; d < 3; d++) {
    const scaled = step * 10 ** d
    if (Math.abs(scaled - Math.round(scaled)) < 1e-9) return d
  }
  return 3
}

/**
 * Eje de fechas completo para unos puntos (ms UTC): dominio, unidad y marcas.
 * `intraday`: serie de horas (24H), con marcas cada 3 horas en hora de Madrid.
 */
export function timeAxis(xs: readonly number[], intraday = false): { domain: [number, number]; unit: TickUnit; ticks: number[] } {
  if (xs.length === 0) return { domain: [0, 0], unit: intraday ? 'hour3' : 'day', ticks: [] }
  const from = Math.min(...xs)
  const to = Math.max(...xs)
  const unit = intraday ? 'hour3' : tickUnit((to - from) / DAY_MS)
  return { domain: [from, to], unit, ticks: timeTicks(from, to, unit) }
}
