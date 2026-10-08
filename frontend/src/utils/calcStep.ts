/** Paso basado en el orden de magnitud del valor actual (mayor precisión cuanto menor es el valor). */
export function calcStep(value: number): number {
  if (value <= 0) return 0.01
  const mag = Math.pow(10, Math.floor(Math.log10(value)) - 1)
  return Math.max(mag, 1e-8)
}
