// Ejercicio fiscal en hora de Madrid (#295). Postgres trabaja en UTC y el
// proceso puede correr con cualquier zona (Docker en UTC, escritorio con la
// del sistema): el año y el mes de una operación se calculan siempre en
// Europe/Madrid, que es lo que cuenta para la AEAT.

export const MADRID_TZ = 'Europe/Madrid';

const PARTS = new Intl.DateTimeFormat('en-CA', { timeZone: MADRID_TZ, year: 'numeric', month: 'numeric' });

/** Año y mes (1–12) de un instante en Madrid. */
export function madridYearMonth(date: Date = new Date()): { year: number; month: number } {
  const parts = PARTS.formatToParts(date);
  const get = (type: string) => parseInt(parts.find(p => p.type === type)?.value ?? '0', 10);
  return { year: get('year'), month: get('month') };
}

/** Último instante del 31 de diciembre en Madrid (23:59:59.999 local), como Date UTC. */
export function endOfYearMadrid(year: number): Date {
  // El 1 de enero siguiente a las 00:00 de Madrid es 23:00Z (invierno, UTC+1).
  return new Date(Date.UTC(year + 1, 0, 1) - 60 * 60 * 1000 - 1);
}

const DATE = new Intl.DateTimeFormat('en-CA', { timeZone: MADRID_TZ, year: 'numeric', month: '2-digit', day: '2-digit' });

/** Fecha local de Madrid en formato ISO (AAAA-MM-DD). */
export function madridDate(date: Date): string {
  return DATE.format(date);
}
