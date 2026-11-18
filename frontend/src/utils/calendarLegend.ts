import { formatMoneyCompact, type Currency } from './format'

// Leyenda del calendario de P&L (#248): casillas con los mismos colores que
// las celdas, de la mayor pérdida a la mayor ganancia, con 0 en el centro.
// La escala es simétrica (el mayor movimiento del mes en valor absoluto), así
// que los extremos se rotulan «Pérdida» y «Ganancia», no «peor/mejor día».

// Fracciones de la escala de cada casilla, de la más intensa a la más suave.
const STEPS = [1, 0.5, 0.2, 0.05] as const

/** Importes de las casillas, de la mayor pérdida a la mayor ganancia (0 en el centro). */
export function legendSteps(maxAbs: number): number[] {
  if (maxAbs <= 0) return []
  return [...STEPS.map(f => -f * maxAbs), 0, ...[...STEPS].reverse().map(f => f * maxAbs)]
}

/** «Escala hasta ±586 €». */
export function legendScale(maxAbs: number, currency: Currency): string {
  return `Escala hasta ±${formatMoneyCompact(maxAbs, currency)}`
}

/** Texto para lectores de pantalla y tooltip de cada casilla. */
export function stepLabel(value: number, currency: Currency): string {
  if (value === 0) return 'Sin variación (0)'
  const amount = formatMoneyCompact(Math.abs(value), currency)
  return value > 0 ? `Ganancia de ~${amount}` : `Pérdida de ~${amount}`
}

/**
 * Posición (0 a 1) de un importe en la barra degradada de la leyenda (#512):
 * 0,5 es el 0; la escala es la raíz cuadrada, como la intensidad de las celdas.
 */
export function posicionLeyenda(value: number, maxAbs: number): number {
  if (maxAbs <= 0 || value === 0) return 0.5
  return 0.5 + Math.sign(value) * 0.5 * Math.sqrt(Math.min(1, Math.abs(value) / maxAbs))
}
