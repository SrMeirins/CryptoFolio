export const DAYS_ES = ['L', 'M', 'X', 'J', 'V', 'S', 'D']
export const MONTHS_ES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
export const MONTHS_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

export function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function today(): string { return ymd(new Date()) }
export function startOfMonth(d: Date): string { return ymd(new Date(d.getFullYear(), d.getMonth(), 1)) }
export function startOfYear(d: Date): string { return `${d.getFullYear()}-01-01` }

export function parseDate(s: string): Date | null {
  if (!s) return null
  const d = new Date(s + 'T00:00:00')
  return isNaN(d.getTime()) ? null : d
}

export function fmtShort(s: string): string {
  const d = parseDate(s)
  if (!d) return ''
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}`
}

/** Celdas 'YYYY-MM-DD' (o null para huecos) de la rejilla de un mes, semana de lunes a domingo. */
export function getDaysInGrid(year: number, month: number): (string | null)[] {
  const first   = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0).getDate()
  // getDay(): 0=domingo → convertir a semana que empieza en lunes: 0→6, 1→0 ... 6→5
  const startDow = (first.getDay() + 6) % 7
  const cells: (string | null)[] = []
  for (let i = 0; i < startDow; i++) cells.push(null)
  for (let d = 1; d <= lastDay; d++) {
    cells.push(ymd(new Date(year, month, d)))
  }
  while (cells.length % 7 !== 0) cells.push(null)
  return cells
}

/** true si `d` está estrictamente entre `from` y `to` (bordes excluidos). */
export function inDateRange(d: string, from: string, to: string): boolean {
  if (!from || !to || !d) return false
  const [a, b] = from <= to ? [from, to] : [to, from]
  return d > a && d < b
}
