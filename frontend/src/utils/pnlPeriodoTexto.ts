import type { Agrupacion, BarraPnl, Racha, ResumenPeriodo } from './pnlPeriodo'
import { monthLabel } from './pnlCalendar'
import { fechaCorta, textoRango, type RangoValor } from './rangoGrafico'

// Textos del resumen del periodo del panel P&L diario (#511): recuentos de
// días, fechas de una racha, etiquetas del eje y título de cada barra.

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`
const fmtCorto = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', timeZone: 'UTC' })
const fmtMes = new Intl.DateTimeFormat('es-ES', { month: 'short', year: '2-digit', timeZone: 'UTC' })
const fmtLargo = new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
const sinPunto = (s: string) => s.replace('.', '')
const fecha = (d: string) => new Date(`${d}T00:00:00Z`)

export const diasTexto = (n: number) => plural(n, 'día', 'días')

/** «12 días en verde, 8 en rojo y 1 plano». */
export function textoDias(r: Pick<ResumenPeriodo, 'verdes' | 'rojos' | 'planos'>): string {
  const partes = [plural(r.verdes, 'día en verde', 'días en verde'), `${r.rojos} en rojo`]
  if (r.planos > 0) partes.push(`${r.planos} ${r.planos === 1 ? 'plano' : 'planos'}`)
  return partes.length === 3 ? `${partes[0]}, ${partes[1]} y ${partes[2]}` : `${partes[0]} y ${partes[1]}`
}

export const textoDiasCerrados = (n: number) => plural(n, 'día cerrado', 'días cerrados')

/** «del 3 nov 2026 al 7 nov 2026» o, con un solo día, «el 3 nov 2026». */
export function fechasRacha(r: Pick<Racha, 'desde' | 'hasta'>): string {
  return r.desde === r.hasta ? `el ${fechaCorta(r.desde)}` : `del ${fechaCorta(r.desde)} al ${fechaCorta(r.hasta)}`
}

/** Etiqueta del eje: «18 nov» en días y semanas, «nov 26» en meses. */
export function etiquetaEje(key: string, a: Agrupacion): string {
  return sinPunto(a === 'mes' ? fmtMes.format(fecha(key)) : fmtCorto.format(fecha(key)))
}

/** Título de la barra en el tooltip: el día, la semana o el mes. */
export function tituloBarra(b: Pick<BarraPnl, 'key' | 'desde' | 'hasta'>, a: Agrupacion): string {
  if (a === 'dia') return fmtLargo.format(fecha(b.desde))
  if (a === 'mes') return monthLabel({ year: Number(b.key.slice(0, 4)), month: Number(b.key.slice(5, 7)) })
  return b.desde === b.hasta ? `Semana del ${fechaCorta(b.desde)}` : `Semana del ${fechaCorta(b.desde)} al ${fechaCorta(b.hasta)}`
}

export const nombreAgrupacion = (a: Agrupacion) => (a === 'dia' ? 'día' : a)

/** Periodo en minúsculas para insertarlo en una frase: «últimos 30 días», «toda la historia», «del 1 ene 2026 al 3 feb 2026». */
export function textoPeriodo(rango: RangoValor, today: string): string {
  if (rango.tipo === 'preset' && rango.preset === 'todo') return 'toda la historia'
  if (rango.tipo === 'preset' && rango.preset === 'anio') return 'este año'
  const t = textoRango(rango, today)
  return t.charAt(0).toLowerCase() + t.slice(1)
}
