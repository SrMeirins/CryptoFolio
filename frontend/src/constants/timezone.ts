// Zona horaria de la aplicación (#346, #390). La zona efectiva la decide el
// backend (Ajustes, variable APP_TIMEZONE o esta por defecto) y llega con
// /settings/timezone; mientras no llega se usa la de por defecto. Esta es la
// única constante con la zona fija del frontend.

export const DEFAULT_TIMEZONE = 'Europe/Madrid'

let current = DEFAULT_TIMEZONE

/** Zona efectiva actual, para formatear instantes en hora local. */
export function getAppTimezone(): string {
  return current
}

/** Cambia la zona actual. Solo la llama el store de la zona (useTimezoneStore). */
export function setCurrentTimezone(tz: string): void {
  current = tz
}
