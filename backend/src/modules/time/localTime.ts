// Fechas en la hora local de una zona (#295, #388). Postgres trabaja en UTC y
// el proceso puede correr con cualquier zona (Docker en UTC, escritorio con la
// del sistema): el día, el mes y el ejercicio fiscal se calculan siempre en la
// zona de la aplicación, sin desfases fijos (los cambios de hora incluidos).

const formatters = new Map<string, Intl.DateTimeFormat>();
function parts(tz: string, ms: number): Record<string, number> {
  let f = formatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz, year: 'numeric', month: 'numeric', day: 'numeric',
      hour: 'numeric', minute: 'numeric', second: 'numeric', hourCycle: 'h23',
    });
    formatters.set(tz, f);
  }
  return Object.fromEntries(f.formatToParts(new Date(ms)).filter(p => p.type !== 'literal').map(p => [p.type, Number(p.value)]));
}

/** Año y mes (1-12) de un instante en la zona. */
export function localYearMonth(tz: string, date: Date = new Date()): { year: number; month: number } {
  const p = parts(tz, date.getTime());
  return { year: p.year, month: p.month };
}

/** Fecha local (AAAA-MM-DD) de un instante en la zona. */
export function localDate(tz: string, date: Date): string {
  const p = parts(tz, date.getTime());
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

/** Desfase de la zona en un instante, en ms (hora local menos UTC). */
function offsetAt(tz: string, ms: number): number {
  const p = parts(tz, ms);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(ms / 1000) * 1000;
}

/**
 * Instante de una medianoche local (00:00 del día dado en la zona). Si esa
 * hora no existe por un cambio de hora, la primera hora válida del día.
 */
export function startOfLocalDay(tz: string, year: number, month: number, day: number): Date {
  const wall = Date.UTC(year, month - 1, day);
  // Dos pasadas: el desfase puede cambiar entre la estimación y el resultado.
  let ms = wall - offsetAt(tz, wall);
  ms = wall - offsetAt(tz, ms);
  return new Date(ms);
}

/** Último instante del 31 de diciembre en la zona (23:59:59.999 local). */
export function endOfLocalYear(tz: string, year: number): Date {
  return new Date(startOfLocalDay(tz, year + 1, 1, 1).getTime() - 1);
}

/** Último día válido del mes (#297): el 29 de febrero en un año no bisiesto pasa a ser el 28. */
export function clampDay(year: number, month: number, day: number): number {
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return Math.min(day, last);
}
