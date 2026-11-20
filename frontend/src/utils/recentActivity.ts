import type { OpGroup } from '../constants/operations'
import { zonedFormat } from './zonedFormat'

// Actividad reciente del Dashboard (#237): selección, filtro por tipo y
// agrupación por día en hora de Madrid. Desde #516: filtro Ingresos, hasta 20
// filas (una ráfaga cuenta como una), ráfagas del mismo tipo, activo y minuto
// agrupadas y días desde la última operación. Funciones puras.

export type ActivityFilter = 'all' | 'buy' | 'sell' | 'income' | 'transfer'

export const ACTIVITY_DAYS = 7
/** Filas como mucho en la lista (una ráfaga agrupada cuenta como una). */
export const ACTIVITY_MAX = 20
export const ACTIVITY_FALLBACK = 10
/** A partir de estos días sin operar, la lista avisa (por si falta importar). */
export const ACTIVITY_STALE_DAYS = 30

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
 * Operaciones de los últimos 7 días; si no hay ninguna en ese plazo, las 10
 * más recientes. `txs` viene ordenado de más reciente a más antigua. El tope
 * de filas se aplica después de agrupar las ráfagas (ver `agruparRafagas`).
 */
export function selectRecent<T extends { timestamp: string }>(txs: readonly T[], today: string): T[] {
  const since = shiftDay(today, -(ACTIVITY_DAYS - 1))
  const recent = txs.filter(t => localDay(t.timestamp) >= since)
  return recent.length ? recent : txs.slice(0, ACTIVITY_FALLBACK)
}

/** Días naturales (zona de la app) desde una operación hasta hoy. */
export function diasDesde(ts: string, today: string): number {
  return Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${localDay(ts)}T00:00:00Z`)) / 86_400_000)
}

const LOCAL_MINUTE = () => zonedFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })

export interface Rafaga<T> {
  /** Clave estable: el id de la primera operación. */
  key: string
  items: T[]
}

/**
 * Agrupa operaciones seguidas del mismo tipo, activo y minuto (zona de la app),
 * como los fills de una orden. Las que no forman ráfaga quedan solas.
 */
export function agruparRafagas<T extends { tx: { id: string; operation_type: string; asset: string; timestamp: string } }>(items: readonly T[]): Rafaga<T>[] {
  const out: Rafaga<T>[] = []
  const clave = (i: T) => `${i.tx.operation_type}|${i.tx.asset}|${LOCAL_MINUTE().format(new Date(i.tx.timestamp))}`
  for (const item of items) {
    const last = out[out.length - 1]
    if (last && clave(last.items[0]) === clave(item)) last.items.push(item)
    else out.push({ key: item.tx.id, items: [item] })
  }
  return out
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

/** Como mucho `max` filas en total, en el orden de los días; los días que se quedan sin filas desaparecen. */
export function limitarFilas<G extends { filas: readonly unknown[] }>(grupos: readonly G[], max: number): G[] {
  const out: G[] = []
  let restantes = max
  for (const g of grupos) {
    if (restantes <= 0) break
    const filas = g.filas.slice(0, restantes)
    restantes -= filas.length
    out.push({ ...g, filas })
  }
  return out
}
