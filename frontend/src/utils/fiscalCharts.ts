import type { MesData } from '../pages/fiscal/types'
import type { Tramo } from './tramosIrpf'
import type { EventFilters } from './fiscalOperations'

// Gráficos de Fiscal (#301): series de la evolución mensual,
// escala de tramos y filtros de operaciones desde la URL. Puras. La
// comparativa interanual vive en comparativaFiscal.ts (#539) y el desglose
// por activo, en desgloseActivo.ts (#540).

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic']

export interface MonthBar {
  mes: number
  label: string
  neto: number | null
  /** Ganancias (positivas) y pérdidas (negativas) del mes (#539). */
  ganancias: number | null
  perdidas: number | null
  operaciones: number
  acumulado: number | null
  /** Acumulado del año anterior en el mismo mes, para comparar (#539). */
  acumuladoPrevio: number | null
  futuro: boolean
}

/**
 * Los 12 meses; en el año en curso, los que aún no han llegado quedan vacíos y
 * marcados como futuros. Con `previo`, el acumulado del año anterior mes a mes.
 */
export function mensualSeries(meses: readonly MesData[], previo?: readonly MesData[]): MonthBar[] {
  const byMonth = new Map(meses.map(m => [m.mes, m]))
  const prevByMonth = new Map((previo ?? []).map(m => [m.mes, m]))
  return MONTHS.map((label, i) => {
    const m = byMonth.get(i + 1)
    const acumuladoPrevio = prevByMonth.get(i + 1)?.acumulado ?? null
    return m
      ? { mes: i + 1, label, neto: m.netoMes, ganancias: m.gananciasMes, perdidas: m.perdidasMes, operaciones: m.operacionesMes, acumulado: m.acumulado, acumuladoPrevio, futuro: false }
      : { mes: i + 1, label, neto: null, ganancias: null, perdidas: null, operaciones: 0, acumulado: null, acumuladoPrevio, futuro: true }
  })
}

/** Tira de la evolución mensual (#539): mejor y peor mes con operaciones y cuántos meses las tuvieron. */
export function resumenMensual(series: readonly MonthBar[]): { mejor: MonthBar | null; peor: MonthBar | null; conOperaciones: number; transcurridos: number } {
  const pasados = series.filter(s => !s.futuro)
  const conOps = pasados.filter(s => s.operaciones > 0)
  const mejor = conOps.reduce<MonthBar | null>((a, s) => (a === null || (s.neto ?? 0) > (a.neto ?? 0) ? s : a), null)
  const peor = conOps.reduce<MonthBar | null>((a, s) => (a === null || (s.neto ?? 0) < (a.neto ?? 0) ? s : a), null)
  return { mejor, peor, conOperaciones: conOps.length, transcurridos: pasados.length }
}

/** Primer y último día de un mes (AAAA-MM-DD), para filtrar las operaciones. */
export function monthRange(year: number, month: number): { desde: string; hasta: string } {
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const mm = String(month).padStart(2, '0')
  return { desde: `${year}-${mm}-01`, hasta: `${year}-${mm}-${String(last).padStart(2, '0')}` }
}

export interface TramoSegment { desde: number; hasta: number; tipo: number; base: number; cuota: number; widthPct: number; activo: boolean; fillPct: number }
export interface TramosScale { segments: TramoSegment[]; markerPct: number; siguiente: { faltan: number; tipo: number } | null }

/**
 * Escalera de tramos para una base (#301): los tramos hasta el siguiente al de
 * la base, todos con el mismo ancho (una escala lineal dejaba el primer tramo
 * en una franja mínima), y la base situada proporcionalmente dentro del suyo.
 */
export function tramosScale(base: number, tramos: readonly Tramo[]): TramosScale {
  const b = Math.max(0, base)
  const idx = Math.max(0, tramos.findIndex(t => b <= t.hasta))
  const shown = tramos.slice(0, Math.min(tramos.length, idx + 2))
  const width = 100 / shown.length
  let desde = 0
  let markerPct = 0
  const segments: TramoSegment[] = shown.map((t, i) => {
    // El último tramo no tiene techo: se dibuja hasta un 25 % más allá de la base.
    const hasta = Number.isFinite(t.hasta) ? t.hasta : Math.max(desde * 1.25, b * 1.25, desde + 1)
    const enTramo = Math.max(0, Math.min(b, hasta) - desde)
    const fillPct = hasta > desde ? (enTramo / (hasta - desde)) * 100 : 0
    if (i === idx) markerPct = i * width + (fillPct / 100) * width
    const seg = { desde, hasta: t.hasta, tipo: t.tipo, base: enTramo, cuota: enTramo * t.tipo / 100, widthPct: width, activo: enTramo > 0, fillPct }
    desde = hasta
    return seg
  })
  const next = tramos[idx + 1]
  const siguiente = next && b > 0 ? { faltan: tramos[idx].hasta - b, tipo: next.tipo } : null
  return { segments, markerPct: Math.min(100, markerPct), siguiente }
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const SYMBOL = /^[A-Z0-9]{1,20}$/

/** Filtros de la tabla de operaciones que llegan por la URL; lo que no valida se ignora. */
export function filtersFromUrl(params: URLSearchParams): Partial<EventFilters> {
  const out: Partial<EventFilters> = {}
  const desde = params.get('desde'), hasta = params.get('hasta'), activo = params.get('activo')
  if (desde && ISO_DATE.test(desde)) out.from = desde
  if (hasta && ISO_DATE.test(hasta)) out.to = hasta
  if (activo && SYMBOL.test(activo)) out.asset = activo
  // Desde las tarjetas del ejercicio (#418): solo ganancias o solo pérdidas.
  const resultado = params.get('resultado')
  if (resultado === 'ganancia') out.result = 'gain'
  else if (resultado === 'perdida') out.result = 'loss'
  return out
}

/** Paso «redondo» (1, 2, 2,5 o 5 por potencia de 10) mayor o igual que `v`. */
export function pasoRedondo(v: number): number {
  if (!(v > 0)) return 1
  const p = 10 ** Math.floor(Math.log10(v))
  const n = v / p
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p
}

export interface EjeAlineado { domain: [number, number]; ticks: number[] }

/**
 * Dos ejes con el cero a la misma altura y las marcas en las mismas líneas
 * (#539): el de los meses y el del acumulado. Los dos se dividen en 4 tramos
 * repartidos igual entre negativos y positivos; cada uno con su paso redondo.
 */
export function dominiosAlineados(a: readonly number[], b: readonly number[], tramos = 4): { a: EjeAlineado; b: EjeAlineado } {
  const ext = (v: readonly number[]) => [Math.min(0, ...v), Math.max(0, ...v)] as const
  const [minA, maxA] = ext(a), [minB, maxB] = ext(b)
  const frac = (min: number, max: number) => (max - min > 0 ? -min / (max - min) : 0)
  const hayNeg = minA < 0 || minB < 0, hayPos = maxA > 0 || maxB > 0
  // Tramos por debajo del cero: los que pida el eje más negativo, siempre dejando sitio a los positivos.
  let neg = hayNeg ? Math.ceil(Math.max(frac(minA, maxA), frac(minB, maxB)) * tramos) : 0
  if (hayPos && neg >= tramos) neg = tramos - 1
  if (!hayPos && !hayNeg) neg = 0
  const pos = tramos - neg
  const eje = (min: number, max: number): EjeAlineado => {
    const paso = pasoRedondo(Math.max(neg > 0 ? -min / neg : 0, pos > 0 ? max / pos : 0))
    const ticks = Array.from({ length: tramos + 1 }, (_, i) => (i - neg) * paso)
    return { domain: [ticks[0], ticks[tramos]], ticks }
  }
  return { a: eje(minA, maxA), b: eje(minB, maxB) }
}
