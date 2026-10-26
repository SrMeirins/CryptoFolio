import type { OpGroup } from '../constants/operations'
import { zonedFormat } from './zonedFormat'

// Actividad reciente del Dashboard (#237): selección, filtro por tipo y
// agrupación por día en hora de Madrid. Funciones puras.

export type ActivityFilter = 'all' | 'buy' | 'sell' | 'transfer'

export const ACTIVITY_DAYS = 7
export const ACTIVITY_MAX = 12
export const ACTIVITY_FALLBACK = 8

const LOCAL_DAY = () => zonedFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' })
const LOCAL_TIME = () => zonedFormat('es-ES', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
const DAY_LABEL = new Intl.DateTimeFormat('es-ES', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'short' })

/** Día local de Madrid (YYYY-MM-DD) de un instante ISO. */
export const localDay = (ts: string) => LOCAL_DAY().format(new Date(ts))
/** Hora local de Madrid («14:05»). */
export const localTimeOf = (ts: string) => LOCAL_TIME().format(new Date(ts))

function shiftDay(day: string, delta: number): string {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + delta)).toISOString().slice(0, 10)
}

/**
 * Operaciones de los últimos 7 días (como máximo 12); si no hay ninguna en ese
 * plazo, las 8 más recientes. `txs` viene ordenado de más reciente a más antigua.
 */
export function selectRecent<T extends { timestamp: string }>(txs: readonly T[], today: string): T[] {
  const since = shiftDay(today, -(ACTIVITY_DAYS - 1))
  const recent = txs.filter(t => localDay(t.timestamp) >= since).slice(0, ACTIVITY_MAX)
  return recent.length ? recent : txs.slice(0, ACTIVITY_FALLBACK)
}

/** Filtro rápido por grupo de operación. */
export function filterActivity<T extends { group: OpGroup }>(items: readonly T[], filter: ActivityFilter): T[] {
  return filter === 'all' ? [...items] : items.filter(i => i.group === filter)
}

/** Etiqueta del día: «Hoy», «Ayer» o «jueves, 3 sept». */
export function dayLabel(day: string, today: string): string {
  if (day === today) return 'Hoy'
  if (day === shiftDay(today, -1)) return 'Ayer'
  const label = DAY_LABEL.format(new Date(`${day}T12:00:00Z`)).replace('.', '')
  return label.charAt(0).toUpperCase() + label.slice(1)
}

/** Agrupa por día local (en el orden recibido), con su etiqueta. */
export function groupByDay<T extends { timestamp: string }>(items: readonly T[], today: string): Array<{ day: string; label: string; items: T[] }> {
  const groups: Array<{ day: string; label: string; items: T[] }> = []
  for (const item of items) {
    const day = localDay(item.timestamp)
    const last = groups[groups.length - 1]
    if (last?.day === day) last.items.push(item)
    else groups.push({ day, label: dayLabel(day, today), items: [item] })
  }
  return groups
}
