import { DEFAULT_TIMEZONE, getAppTimezone } from '../constants/timezone'

// Nombre visible de la zona horaria (#390): «hora de Madrid», «hora de
// Canarias»... Con la zona por defecto el texto no cambia respecto a cuando
// la zona era fija.

const NAMES: Record<string, string> = {
  [DEFAULT_TIMEZONE]: 'Madrid',
  'Atlantic/Canary': 'Canarias',
  'Europe/Lisbon': 'Lisboa',
  'Europe/London': 'Londres',
  'America/New_York': 'Nueva York',
  'America/Mexico_City': 'Ciudad de México',
  'America/Bogota': 'Bogotá',
  'America/Argentina/Buenos_Aires': 'Buenos Aires',
}

/** Nombre corto de la zona: la ciudad de su identificador IANA. */
export function timezoneCity(tz: string): string {
  return NAMES[tz] ?? tz.split('/').pop()!.replace(/_/g, ' ')
}

/** «hora de Madrid» para la zona dada (por defecto, la actual de la aplicación). */
export function timezoneLabel(tz: string = getAppTimezone()): string {
  return tz === 'UTC' || tz === 'Etc/UTC' ? 'hora UTC' : `hora de ${timezoneCity(tz)}`
}
