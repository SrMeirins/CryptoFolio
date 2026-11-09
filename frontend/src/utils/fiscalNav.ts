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
