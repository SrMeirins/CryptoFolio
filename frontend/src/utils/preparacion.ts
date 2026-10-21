// Progreso de la preparación de los históricos (#334). Lógica pura.

/** Porcentaje entero de activos listos; con total 0, el mínimo visible que se pida. */
export function porcentajePreparacion(progreso: { listos: number; total: number } | undefined, minimo = 0): number {
  if (!progreso || progreso.total <= 0) return minimo
  return Math.min(100, Math.max(minimo, Math.round((progreso.listos / progreso.total) * 100)))
}
