// Periodo y granularidad del gráfico de actividad del Historial (#376).
// Funciones puras: el día de hoy (local de la zona de la app) llega como dato.

/** Meses por defecto sin filtro de fechas. */
export const DEFAULT_MONTHS = 18;
/** Por encima de estos meses el gráfico se agrupa por años. */
export const MAX_MONTHS = 36;

export type Granularity = 'month' | 'year';

export interface ChartPeriod {
  granularity: Granularity;
  /** Primer y último periodo, como primer día (YYYY-MM-DD) del mes o del año. */
  from: string;
  to: string;
}

const monthIndex = (day: string) => Number(day.slice(0, 4)) * 12 + Number(day.slice(5, 7)) - 1;
const fromIndex = (i: number) => `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}-01`;

/**
 * Con fechas filtradas, los meses de ese rango (hasta hoy si falta el final;
 * los 18 meses previos al final si falta el inicio); sin fechas, los últimos
 * 18 meses. Si el rango pasa de 36 meses, por años.
 */
export function chartPeriod(f: { date_from?: string; date_to?: string }, today: string): ChartPeriod {
  let end = monthIndex(f.date_to ?? today);
  const start = f.date_from ? monthIndex(f.date_from) : end - (DEFAULT_MONTHS - 1);
  if (end < start) end = start;
  if (end - start + 1 > MAX_MONTHS) {
    return { granularity: 'year', from: `${Math.floor(start / 12)}-01-01`, to: `${Math.floor(end / 12)}-01-01` };
  }
  return { granularity: 'month', from: fromIndex(start), to: fromIndex(end) };
}

/** Día de hoy (YYYY-MM-DD) en una zona horaria. */
export function todayIn(tz: string, now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}
