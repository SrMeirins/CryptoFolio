// Lógica del MonthPicker (#240). Año y mes con mes 1–12.

export interface YM { year: number; month: number }

const cmp = (a: YM, b: YM) => (a.year !== b.year ? a.year - b.year : a.month - b.month)

/** El mes está fuera del rango [min, max]. */
export function outOfRange(ym: YM, min: YM, max: YM): boolean {
  return cmp(ym, min) < 0 || cmp(ym, max) > 0
}

/** Años disponibles entre min y max, ambos incluidos. */
export function yearsBetween(min: YM, max: YM): number[] {
  return Array.from({ length: Math.max(0, max.year - min.year + 1) }, (_, i) => min.year + i)
}

/** Mes de destino al mover el foco por la rejilla de 4 columnas con las flechas; null si la tecla no aplica. */
export function monthGridMove(month: number, key: string): number | null {
  const delta: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -4, ArrowDown: 4 }
  if (key === 'Home') return 1
  if (key === 'End') return 12
  if (!(key in delta)) return null
  const next = month + delta[key]
  return next >= 1 && next <= 12 ? next : null
}
