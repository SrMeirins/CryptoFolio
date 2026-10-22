import { APP_TIMEZONE } from '../constants/timezone'

// Atajos del selector de fechas (#366), en días locales de la app (no en la
// zona del navegador ni en UTC). Funciones puras sobre fechas AAAA-MM-DD.

export interface DatePreset {
  id: 'hoy' | '30d' | 'mes' | 'mes-pasado' | 'anio' | 'anio-pasado'
  label: string
  from: string
  to: string
}

const DAY_FMT = new Intl.DateTimeFormat('en-CA', { timeZone: APP_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' })

/** Hoy en la zona de la app (AAAA-MM-DD). */
export function appToday(now: Date = new Date()): string {
  return DAY_FMT.format(now)
}

const pad = (n: number) => String(n).padStart(2, '0')
/** Suma días a una fecha AAAA-MM-DD (aritmética de calendario, sin horas). */
function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
function lastDayOfMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate()
}

/** Atajos relativos a `today` (AAAA-MM-DD en la zona de la app). */
export function datePresets(today: string): DatePreset[] {
  const [y, m] = today.split('-').map(Number)
  const prevY = m === 1 ? y - 1 : y
  const prevM = m === 1 ? 12 : m - 1
  return [
    { id: 'hoy', label: 'Hoy', from: today, to: today },
    { id: '30d', label: 'Últimos 30 días', from: addDays(today, -29), to: today },
    { id: 'mes', label: 'Este mes', from: `${y}-${pad(m)}-01`, to: today },
    { id: 'mes-pasado', label: 'Mes pasado', from: `${prevY}-${pad(prevM)}-01`, to: `${prevY}-${pad(prevM)}-${pad(lastDayOfMonth(prevY, prevM))}` },
    { id: 'anio', label: 'Este año', from: `${y}-01-01`, to: today },
    { id: 'anio-pasado', label: 'Año pasado', from: `${y - 1}-01-01`, to: `${y - 1}-12-31` },
  ]
}
