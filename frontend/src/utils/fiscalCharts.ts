import type { BreakdownItem, MesData, YearOverview } from '../pages/fiscal/types'
import type { Tramo } from './tramosIrpf'
import type { EventFilters } from './fiscalOperations'

// Gráficos de Fiscal (#301): series de la comparativa, la evolución mensual y
// el desglose, escala de tramos y filtros de operaciones desde la URL. Puras.

export interface YearBar { year: number; ganancias: number; perdidas: number; neto: number; enCurso: boolean }

/** Comparativa interanual en orden cronológico; las pérdidas, en negativo. */
export function comparativaSeries(overview: readonly YearOverview[]): YearBar[] {
  return [...overview].sort((a, b) => a.year - b.year).map(o => ({
    year: o.year, ganancias: o.totalGanancias, perdidas: -Math.abs(o.totalPerdidas), neto: o.netoPatrimonial, enCurso: o.esAnioEnCurso,
  }))
}

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic']

export interface MonthBar { mes: number; label: string; neto: number | null; acumulado: number | null; futuro: boolean }

/** Los 12 meses; en el año en curso, los que aún no han llegado quedan vacíos y marcados como futuros. */
export function mensualSeries(meses: readonly MesData[]): MonthBar[] {
  const byMonth = new Map(meses.map(m => [m.mes, m]))
  return MONTHS.map((label, i) => {
    const m = byMonth.get(i + 1)
    return m
      ? { mes: i + 1, label, neto: m.netoMes, acumulado: m.acumulado, futuro: false }
      : { mes: i + 1, label, neto: null, acumulado: null, futuro: true }
  })
}

export interface AssetRow { asset: string; ganancias: number; perdidas: number; neto: number; operaciones: number; otros?: number }

/** Los `top` activos con más movimiento (ganancias + pérdidas) y el resto sumado en «Otros». */
export function desgloseSeries(items: readonly BreakdownItem[], top = 8): AssetRow[] {
  const sorted = [...items].sort((a, b) => (b.ganancias + Math.abs(b.perdidas)) - (a.ganancias + Math.abs(a.perdidas)) || a.asset.localeCompare(b.asset))
  const head: AssetRow[] = sorted.slice(0, top).map(i => ({ ...i, perdidas: -Math.abs(i.perdidas) }))
  const rest = sorted.slice(top)
  if (rest.length === 0) return head
  return [...head, rest.reduce<AssetRow>((acc, i) => ({
    ...acc,
    ganancias: acc.ganancias + i.ganancias,
    perdidas: acc.perdidas - Math.abs(i.perdidas),
    neto: acc.neto + i.neto,
    operaciones: acc.operaciones + i.operaciones,
  }), { asset: 'Otros', ganancias: 0, perdidas: 0, neto: 0, operaciones: 0, otros: rest.length })]
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
