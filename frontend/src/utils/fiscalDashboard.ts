import type { Carryforward, FiscalEvent } from '../pages/fiscal/types'
import { EMPTY_FILTERS, filterEvents } from './fiscalOperations'

// Panel Fiscal del Dashboard (#515): ejercicio por defecto según la fecha,
// enlaces a cada vista de Fiscal con su filtro, recuentos de operaciones con
// ganancia y con pérdida (el mismo filtro que Operaciones) y pérdidas
// pendientes que caducan este año. Funciones puras.

/** Meses de la campaña de la Renta (abril a junio): se declara el ejercicio anterior. */
export const MESES_CAMPANA = [4, 5, 6] as const

/**
 * Ejercicio por defecto: en campaña de la Renta, el anterior (el que se
 * declara); el resto del año, el en curso. Si no hay datos de ese año, el más
 * reciente de los disponibles.
 */
export function ejercicioPorDefecto(today: string, disponibles: readonly number[]): number | null {
  if (disponibles.length === 0) return null
  const anio = Number(today.slice(0, 4))
  const mes = Number(today.slice(5, 7))
  const preferido = (MESES_CAMPANA as readonly number[]).includes(mes) ? anio - 1 : anio
  if (disponibles.includes(preferido)) return preferido
  return Math.max(...disponibles.filter(y => y <= preferido), Math.min(...disponibles))
}

const pad = (n: number) => String(n).padStart(2, '0')
const ultimoDia = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate()

/** Rutas de Fiscal para cada cifra del panel, con el ejercicio y el filtro. */
export function enlacesFiscal(year: number, enCurso: boolean) {
  const base = `/fiscal?anio=${year}`
  return {
    resultado: base,
    // Planificar es del ejercicio en curso; uno cerrado se explica en su Resumen (cascada de la cuota).
    irpf: enCurso ? '/fiscal?vista=planificar' : base,
    ganancias: `${base}&vista=operaciones&resultado=ganancia`,
    perdidas: `${base}&vista=operaciones&resultado=perdida`,
    mes: (m: number) => `${base}&vista=operaciones&desde=${year}-${pad(m)}-01&hasta=${year}-${pad(m)}-${pad(ultimoDia(year, m))}`,
    modelo721: `${base}&vista=modelo721`,
    planificar: '/fiscal?vista=planificar',
  }
}

/** Operaciones con ganancia y con pérdida, con el mismo criterio que el filtro de Operaciones. */
export function recuentoResultado(events: readonly FiscalEvent[]): { ganancias: number; perdidas: number } {
  return {
    ganancias: filterEvents(events, { ...EMPTY_FILTERS, result: 'gain' }).length,
    perdidas: filterEvents(events, { ...EMPTY_FILTERS, result: 'loss' }).length,
  }
}

/** Pérdidas pendientes de ejercicios cerrados que caducan este año si no se compensan. */
export function perdidasQueCaducan(carryforward: Carryforward | undefined, anioEnCurso: number): number {
  return Math.round((carryforward?.origenes ?? [])
    .filter(o => !o.provisional && o.caducaEn === anioEnCurso && o.pendiente > 0)
    .reduce((s, o) => s + o.pendiente, 0) * 100) / 100
}
