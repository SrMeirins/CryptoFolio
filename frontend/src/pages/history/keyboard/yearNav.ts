// Saltos por año fiscal en el Historial (#382). El año fiscal es el natural en
// la zona de la app; el filtro de fechas ya trabaja en días de esa zona, así
// que un año es el rango del 1 de enero al 31 de diciembre. Funciones puras.

/** Rango de fechas (AAAA-MM-DD) de un año completo. */
export function yearRange(year: number): { from: string; to: string } {
  return { from: `${year}-01-01`, to: `${year}-12-31` }
}

/** Historial filtrado por un año (enlace desde Fiscal), con los parámetros de su URL. */
export function historyYearLink(year: number): string {
  const r = yearRange(year)
  return `/history?desde=${r.from}&hasta=${r.to}`
}

/** Año elegido si el filtro de fechas es exactamente un año completo; si no, null. */
export function selectedYear(from: string, to: string): number | null {
  const m = /^(\d{4})-01-01$/.exec(from)
  return m && to === `${m[1]}-12-31` ? Number(m[1]) : null
}

/**
 * Año al que llevan las flechas desde la situación actual, o null si no hay
 * dónde ir. `years` va en orden ascendente. Sin año elegido, «anterior» va al
 * año de inicio del rango personalizado o, sin rango, al más reciente con datos;
 * «siguiente» no hace nada.
 */
export function stepYear(years: readonly number[], current: number | null, rangeFrom: string, step: -1 | 1): number | null {
  if (years.length === 0) return null
  if (current === null) {
    if (step === 1) return null
    const start = /^(\d{4})-/.exec(rangeFrom)
    const startYear = start ? Number(start[1]) : null
    return startYear !== null && years.includes(startYear) ? startYear : years[years.length - 1]
  }
  const i = years.indexOf(current)
  if (i < 0) return step === -1 ? [...years].reverse().find(y => y < current) ?? null : years.find(y => y > current) ?? null
  return years[i + step] ?? null
}
