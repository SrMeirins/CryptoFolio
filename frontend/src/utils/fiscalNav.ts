import type { FiscalVista } from './fiscalHeader'

// Menú lateral de Fiscal (#535): estado de cada ejercicio y avisos de cada vista.

export type EstadoEjercicio = 'en-curso' | 'declarado' | 'por-declarar'

export const ESTADO_EJERCICIO_LABEL: Record<EstadoEjercicio, string> = {
  'en-curso': 'En curso', declarado: 'Declarado', 'por-declarar': 'Por declarar',
}

/** «En curso» el año actual; «Declarado» si se marcó su renta; «Por declarar» un año cerrado sin marcar. */
export function estadoEjercicio(esAnioEnCurso: boolean, rentaMarcada: boolean): EstadoEjercicio {
  if (esAnioEnCurso) return 'en-curso'
  return rentaMarcada ? 'declarado' : 'por-declarar'
}

/**
 * Qué vistas piden una acción, con el motivo para el lector de pantalla. Solo
 * lo que hay que hacer: la información (pérdidas que caducan, recompras) se ve
 * dentro de cada vista y no repite indicador en el menú.
 */
export function avisosVistas(s: {
  rentaCambiada: boolean
  obligado721SinPresentar: boolean
}): Partial<Record<FiscalVista, string>> {
  const out: Partial<Record<FiscalVista, string>> = {}
  if (s.rentaCambiada) out.resumen = 'las cifras declaradas han cambiado'
  if (s.obligado721SinPresentar) out.modelo721 = 'hay que presentarlo'
  return out
}

/**
 * Reparto de ganancias frente a pérdidas de un ejercicio (#536), en % enteros
 * que suman 100 (las pérdidas llegan en negativo). Sin movimiento, null.
 */
export function repartoGananciasPerdidas(ganancias: number, perdidas: number): { ganancias: number; perdidas: number } | null {
  const g = Math.max(0, ganancias)
  const p = Math.abs(perdidas)
  if (g + p < 0.005) return null
  const pg = Math.round((g / (g + p)) * 100)
  return { ganancias: pg, perdidas: 100 - pg }
}

/**
 * Encaje del carrusel de ejercicios (#536): cuántas tarjetas completas caben en
 * `ancho` (ninguna cortada) y su ancho exacto para ocupar la fila de borde a
 * borde. Con menos tarjetas de las que caben, se reparten todo el ancho.
 */
export function encajeCarrusel(ancho: number, total: number, minimo = 208, hueco = 12): { visibles: number; anchoTarjeta: number } {
  if (ancho <= 0 || total <= 0) return { visibles: 0, anchoTarjeta: 0 }
  const caben = Math.max(1, Math.floor((ancho + hueco) / (minimo + hueco)))
  const visibles = Math.min(caben, total)
  return { visibles, anchoTarjeta: (ancho - hueco * (visibles - 1)) / visibles }
}
