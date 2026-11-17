import type { ChartPoint } from './assetPriceChart'
import { resolverRango, type RangoValor } from './rangoGrafico'

// Zoom y desplazamiento del gráfico de precio del detalle (#528), como en un
// gráfico de exchange: la ventana visible es un tramo [from, to] de la
// historia completa (extent). Funciones puras: la rueda acerca o aleja
// centrando en el cursor, arrastrar desplaza, y nunca se sale de la historia
// ni baja de un tramo mínimo.

export interface Ventana { from: number; to: number }

const DAY_MS = 86_400_000
/** Tramo mínimo visible: por debajo no hay cierres diarios suficientes. */
export const MIN_SPAN = 5 * DAY_MS
/** Factor de cada paso de zoom (rueda, botones o teclado). */
export const ZOOM_STEP = 1.25

const span = (v: Ventana) => v.to - v.from

/** Encaja una ventana dentro de la historia sin cambiar su anchura (salvo que no quepa). */
export function encajar(v: Ventana, extent: Ventana): Ventana {
  const width = Math.min(Math.max(span(v), Math.min(MIN_SPAN, span(extent))), span(extent))
  let from = Math.max(extent.from, Math.min(v.from, extent.to - width))
  if (!Number.isFinite(from)) from = extent.from
  return { from, to: from + width }
}

/**
 * Acerca (factor menor que 1) o aleja (mayor que 1) manteniendo fijo el
 * instante `anchor` bajo el cursor.
 */
export function zoomVentana(v: Ventana, extent: Ventana, factor: number, anchor: number): Ventana {
  const width = span(v) * factor
  const at = Math.min(Math.max(anchor, v.from), v.to)
  const frac = span(v) > 0 ? (at - v.from) / span(v) : 0.5
  return encajar({ from: at - frac * width, to: at - frac * width + width }, extent)
}

/** Desplaza la ventana `delta` ms (negativo, hacia el pasado). */
export function desplazarVentana(v: Ventana, extent: Ventana, delta: number): Ventana {
  return encajar({ from: v.from + delta, to: v.to + delta }, extent)
}

/** La ventana es toda la historia (vista por defecto). */
export function esCompleta(v: Ventana, extent: Ventana): boolean {
  return v.from <= extent.from + DAY_MS / 2 && v.to >= extent.to - DAY_MS / 2
}

const diaDe = (t: number) => new Date(t).toISOString().slice(0, 10)

/**
 * Ventana del gráfico para un rango común (#508); null es la vista completa
 * («Todo»). Los días van de las 00:00 a las 23:59 (los puntos son de mediodía).
 */
export function rangoAVentana(r: RangoValor, today: string): Ventana | null {
  if (r.tipo === 'preset' && r.preset === 'todo') return null
  const res = resolverRango(r, today)
  if (!res.from) return null
  return { from: Date.parse(`${res.from}T00:00:00Z`), to: Date.parse(`${res.to}T23:59:59Z`) }
}

/**
 * Rango personalizado de una ventana de zoom (#508): sus días y, si llega al
 * final de la historia, «Hasta hoy»; la vista completa es «Todo».
 */
export function ventanaARango(v: Ventana | null, extent: Ventana): RangoValor {
  if (v === null || esCompleta(v, extent)) return { tipo: 'preset', preset: 'todo' }
  const hastaHoy = v.to >= extent.to - DAY_MS / 2
  return { tipo: 'rango', from: diaDe(v.from), to: diaDe(v.to), hastaHoy }
}

/** Puntos dentro de la ventana, con el vecino de cada lado para que la línea llegue a los bordes. */
export function puntosEnVentana(points: readonly ChartPoint[], v: Ventana): ChartPoint[] {
  let i = points.findIndex(p => p.t >= v.from)
  if (i === -1) return points.length > 0 ? [points[points.length - 1]] : []
  let j = points.length - 1
  while (j > i && points[j].t > v.to) j--
  i = Math.max(0, i - 1)
  j = Math.min(points.length - 1, j + 1)
  return points.slice(i, j + 1)
}
