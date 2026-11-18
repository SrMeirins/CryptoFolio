import type { CalendarDay } from './pnlCalendar'

// Calendario de P&L (#216): totales por semana, escala de color continua y
// navegación con teclado. Los totales del año, con su Dietz, en
// calendarioDietz.ts (#512). Funciones puras.

/** P&L de cada semana de la cuadrícula (días completos); null si la semana no tiene datos. */
export function weekTotals(weeks: ReadonlyArray<ReadonlyArray<string | null>>, byDate: ReadonlyMap<string, CalendarDay>): Array<number | null> {
  return weeks.map(week => {
    const days = week.map(d => (d ? byDate.get(d) : undefined)).filter((d): d is CalendarDay => !!d && d.complete)
    return days.length ? Math.round(days.reduce((s, d) => s + d.pnl, 0) * 100) / 100 : null
  })
}

/**
 * Opacidad del color de un día (en %), continua según su |P&L| respecto al
 * mayor del periodo. Raíz cuadrada para que los días pequeños sigan viéndose;
 * 0 si el P&L es 0. Rango 8–40 %, legible sobre ambos temas.
 */
export function colorAlpha(pnl: number, maxAbs: number): number {
  if (pnl === 0 || maxAbs <= 0) return 0
  return Math.round(8 + 32 * Math.sqrt(Math.min(1, Math.abs(pnl) / maxAbs)))
}

/**
 * Día al que mueve una tecla en la cuadrícula (patrón grid del WAI-ARIA):
 * flechas ±1 día o ±1 semana, Inicio/Fin al lunes/domingo de la semana. null
 * si la tecla no aplica. Desde #512 las flechas cruzan de mes: el calendario
 * pasa al mes del destino.
 */
export function gridMove(date: string, key: string): string | null {
  const [y, m, d] = date.split('-').map(Number)
  const weekday = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7   // 0 = lunes
  const delta: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7, Home: -weekday, End: 6 - weekday }
  if (!(key in delta)) return null
  const next = new Date(Date.UTC(y, m - 1, d + delta[key]))
  return next.toISOString().slice(0, 10)
}
