import { DEFAULT_TIMEZONE } from '../constants/timezone'
import { timezoneCity } from './timezoneLabel'

// Opciones del selector de zona horaria de Ajustes (#390). Funciones puras.

export interface TimezoneOption { value: string; label: string; description?: string; group: string }

/** Zona del sistema (la del navegador o del escritorio), si se puede saber. */
export function systemTimezone(): string | null {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || null } catch { return null }
}

/** Todas las zonas IANA que conoce el motor de Intl (y UTC). */
export function allTimezones(): string[] {
  const list = Intl.supportedValuesOf('timeZone')
  return list.includes('UTC') ? list : [...list, 'UTC']
}

/**
 * Sugeridas arriba (Madrid, Canarias y la del sistema, sin repetir) y debajo
 * todas las demás en orden alfabético.
 */
export function timezoneOptions(all: readonly string[], system: string | null): TimezoneOption[] {
  const suggested = [...new Set([DEFAULT_TIMEZONE, 'Atlantic/Canary', ...(system && all.includes(system) ? [system] : [])])]
  const opt = (tz: string, group: string, extra?: string): TimezoneOption =>
    ({ value: tz, label: timezoneCity(tz), description: extra ? `${tz} · ${extra}` : tz, group })
  return [
    ...suggested.map(tz => opt(tz, 'Sugeridas', tz === system ? 'la del sistema' : undefined)),
    ...[...all].filter(tz => !suggested.includes(tz)).sort().map(tz => opt(tz, 'Todas las zonas')),
  ]
}
