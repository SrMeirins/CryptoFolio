import type { CalendarDay } from './pnlCalendar'

// Resumen del periodo del panel P&L diario (#511): días del rango, barras
// agrupadas por día, semana o mes con su acumulado, recuento de días verdes y
// rojos, mejor y peor día, rachas más largas y día verde y rojo medio.
// Reglas:
// - El acumulado y las barras incluyen hoy (en vivo), así que la suma de las
//   barras es siempre el acumulado de la cabecera.
// - Recuentos, mejor y peor día, rachas y medias solo cuentan días cerrados:
//   hoy no entra hasta que cierra.
// - Un día sin dato (ni cerrado ni en curso) no suma y corta la racha, igual
//   que un día plano (P&L 0). Funciones puras.

export type Agrupacion = 'dia' | 'semana' | 'mes'

export interface BarraPnl {
  /** Clave de la barra: el día, el lunes de la semana o el primer día del mes. */
  key: string
  /** Primer y último día con dato que recoge la barra. */
  desde: string
  hasta: string
  pnl: number
  /** Acumulado del periodo hasta esta barra, incluida. */
  acumulado: number
  /** Recoge el día en curso: su importe aún cambia. */
  enCurso: boolean
}

export interface Racha {
  signo: 'up' | 'down'
  dias: number
  desde: string
  hasta: string
}

export interface ResumenPeriodo {
  total: number
  verdes: number
  rojos: number
  planos: number
  mejor: CalendarDay | null
  peor: CalendarDay | null
  rachaVerde: Racha | null
  rachaRoja: Racha | null
  mediaVerde: number | null
  mediaRoja: number | null
}

const round2 = (n: number) => Math.round(n * 100) / 100
const DIA_MS = 86_400_000
const ms = (d: string) => Date.parse(`${d}T00:00:00Z`)
const iso = (t: number) => new Date(t).toISOString().slice(0, 10)

/** Días de [from, to] (from vacío: desde el principio) con dato: cerrados o en curso. */
export function diasDelPeriodo<T extends CalendarDay>(days: readonly T[], from: string | undefined, to: string): T[] {
  return days.filter(d => (from === undefined || d.date >= from) && d.date <= to && (d.complete || d.live))
}

/** Agrupación por defecto según la duración del rango: diaria hasta ~3 meses, semanal hasta un año y mensual después. */
export function agrupacionAuto(dias: number): Agrupacion {
  if (dias <= 92) return 'dia'
  if (dias <= 366) return 'semana'
  return 'mes'
}

/** Lunes de la semana del día (semanas de lunes a domingo). */
export function lunesDe(date: string): string {
  const t = ms(date)
  const dow = (new Date(t).getUTCDay() + 6) % 7
  return iso(t - dow * DIA_MS)
}

const claveDe = (date: string, a: Agrupacion) => (a === 'dia' ? date : a === 'semana' ? lunesDe(date) : `${date.slice(0, 7)}-01`)

/** Barras del periodo en la agrupación pedida, con el acumulado de cada una. */
export function barrasPeriodo(dias: readonly CalendarDay[], a: Agrupacion): BarraPnl[] {
  const out: BarraPnl[] = []
  let suma = 0
  for (const d of dias) {
    const key = claveDe(d.date, a)
    suma += d.pnl
    const last = out[out.length - 1]
    if (last && last.key === key) {
      last.pnl = round2(last.pnl + d.pnl)
      last.hasta = d.date
      last.acumulado = round2(suma)
      last.enCurso ||= d.live
    } else {
      out.push({ key, desde: d.date, hasta: d.date, pnl: round2(d.pnl), acumulado: round2(suma), enCurso: d.live })
    }
  }
  return out
}

/** Recuentos, extremos, rachas y medias de los días cerrados; el total incluye hoy. */
export function resumenPeriodo(dias: readonly CalendarDay[]): ResumenPeriodo {
  const cerrados = dias.filter(d => d.complete && !d.live)
  const verdes = cerrados.filter(d => d.pnl > 0)
  const rojos = cerrados.filter(d => d.pnl < 0)
  const media = (xs: readonly CalendarDay[]) => (xs.length ? round2(xs.reduce((s, d) => s + d.pnl, 0) / xs.length) : null)
  return {
    total: round2(dias.reduce((s, d) => s + d.pnl, 0)),
    verdes: verdes.length,
    rojos: rojos.length,
    planos: cerrados.length - verdes.length - rojos.length,
    mejor: verdes.reduce<CalendarDay | null>((b, d) => (!b || d.pnl > b.pnl ? d : b), null),
    peor: rojos.reduce<CalendarDay | null>((w, d) => (!w || d.pnl < w.pnl ? d : w), null),
    rachaVerde: rachaMasLarga(cerrados, 'up'),
    rachaRoja: rachaMasLarga(cerrados, 'down'),
    mediaVerde: media(verdes),
    mediaRoja: media(rojos),
  }
}

/**
 * Racha más larga de días seguidos (fechas consecutivas) con el signo pedido.
 * Un hueco en las fechas o un día de otro signo la corta. Con empate, la más
 * reciente.
 */
export function rachaMasLarga(cerrados: readonly CalendarDay[], signo: 'up' | 'down'): Racha | null {
  // Anotados con «as»: con «: Racha | null = null» el análisis de flujo los deja en null dentro del bucle.
  let mejor = null as Racha | null
  let actual = null as Racha | null
  let previo = null as string | null
  for (const d of cerrados) {
    const ok = signo === 'up' ? d.pnl > 0 : d.pnl < 0
    const seguido = previo !== null && ms(d.date) - ms(previo) === DIA_MS
    if (!ok) actual = null
    else if (actual && seguido) actual = { signo, dias: actual.dias + 1, desde: actual.desde, hasta: d.date }
    else actual = { signo, dias: 1, desde: d.date, hasta: d.date }
    if (actual && (!mejor || actual.dias >= mejor.dias)) mejor = actual
    previo = d.date
  }
  return mejor
}
