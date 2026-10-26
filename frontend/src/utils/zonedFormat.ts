import { getAppTimezone } from '../constants/timezone'

// Formateadores de fechas en la zona de la aplicación (#390). Construir un
// Intl.DateTimeFormat es caro: se memoiza por zona, idioma y opciones, así que
// tras un cambio de zona se crean una vez y se reutilizan.

const cache = new Map<string, Intl.DateTimeFormat>()

/** Formateador de instantes en la zona actual de la aplicación. */
export function zonedFormat(locale: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const tz = getAppTimezone()
  const key = `${tz}|${locale}|${JSON.stringify(options)}`
  let f = cache.get(key)
  if (!f) {
    f = new Intl.DateTimeFormat(locale, { ...options, timeZone: tz })
    cache.set(key, f)
  }
  return f
}
