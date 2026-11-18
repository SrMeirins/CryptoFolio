import type { CalendarDay } from './pnlCalendar'

// Detalle y patrón de los días del P&L diario (#512): puesto de un día entre
// los del mes, media por día de la semana y reparto de un día por activos en
// barras divergentes. Solo cuentan los días cerrados. Funciones puras.

export interface PuestoDia {
  /** 1 = el mejor (si gana) o el peor (si pierde). */
  puesto: number
  sentido: 'mejor' | 'peor'
  /** Días cerrados del mes. */
  de: number
  /** Posición del día entre el peor (0) y el mejor (1) del mes, para la mini regla. */
  posicion: number
}

/** Puesto de un día cerrado entre los días cerrados del mes; null si no está cerrado o es plano. */
export function puestoDelDia(dias: readonly CalendarDay[], date: string): PuestoDia | null {
  const cerrados = dias.filter(d => d.complete && !d.live)
  const dia = cerrados.find(d => d.date === date)
  if (!dia || dia.pnl === 0) return null
  const sentido = dia.pnl > 0 ? 'mejor' : 'peor'
  const puesto = 1 + cerrados.filter(d => (sentido === 'mejor' ? d.pnl > dia.pnl : d.pnl < dia.pnl)).length
  const min = Math.min(...cerrados.map(d => d.pnl))
  const max = Math.max(...cerrados.map(d => d.pnl))
  return { puesto, sentido, de: cerrados.length, posicion: max > min ? (dia.pnl - min) / (max - min) : 0.5 }
}

export interface MediaDiaSemana {
  /** 0 = lunes … 6 = domingo. */
  dia: number
  media: number | null
  dias: number
}

/** Media del P&L por día de la semana (lunes a domingo) de los días cerrados. */
export function patronSemanal(dias: readonly CalendarDay[]): MediaDiaSemana[] {
  const suma = Array.from({ length: 7 }, () => ({ total: 0, n: 0 }))
  for (const d of dias) {
    if (!d.complete || d.live) continue
    const dow = (new Date(`${d.date}T00:00:00Z`).getUTCDay() + 6) % 7
    suma[dow].total += d.pnl
    suma[dow].n++
  }
  return suma.map((s, dia) => ({ dia, media: s.n ? Math.round((s.total / s.n) * 100) / 100 : null, dias: s.n }))
}

/** Aportaciones por activo de mayor ganancia a mayor pérdida, con su fracción del mayor |importe| para la barra. */
export function barrasActivos(aportaciones: ReadonlyArray<{ asset: string; pnl: number }>): Array<{ asset: string; pnl: number; fraccion: number }> {
  const max = aportaciones.reduce((m, a) => Math.max(m, Math.abs(a.pnl)), 0)
  return [...aportaciones]
    .filter(a => a.pnl !== 0)
    .sort((a, b) => b.pnl - a.pnl)
    .map(a => ({ ...a, fraccion: max > 0 ? Math.abs(a.pnl) / max : 0 }))
}

/** «1.º», «2.º»… */
export const ordinal = (n: number) => `${n}.º`
