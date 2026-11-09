import { describe, expect, it } from 'vitest'
import { textoPlazoRenta } from './plazoRenta'
import type { FiscalHito } from '../api/portfolio'

// Plazo de la Renta en el bloque del ejercicio (#537). Datos sintéticos.
const hito = (p: Partial<FiscalHito>): FiscalHito => ({
  id: 'renta', ejercicio: 2025, titulo: 'Renta de 2025', desde: '2026-04-08', hasta: '2026-06-30',
  inicioAproximado: false, estado: 'en-curso', diasRestantes: 10, diasParaAbrir: 0, progreso: 0.5, ...p,
})

describe('textoPlazoRenta', () => {
  it('sin hito o con el plazo pasado: cerrado', () => {
    expect(textoPlazoRenta(undefined)).toBe('Plazo de la Renta cerrado')
    expect(textoPlazoRenta(hito({ estado: 'pasado' }))).toBe('Plazo de la Renta cerrado')
  })
  it('próximo: cuándo abre, también aproximado', () => {
    expect(textoPlazoRenta(hito({ estado: 'proximo' }))).toMatch(/^La Renta abre el 8 /)
    expect(textoPlazoRenta(hito({ estado: 'proximo', inicioAproximado: true }))).toMatch(/^La Renta abre hacia /)
  })
  it('en curso: días que quedan y último día', () => {
    expect(textoPlazoRenta(hito({}))).toMatch(/^Renta: 10 días para el 30 /)
    expect(textoPlazoRenta(hito({ diasRestantes: 1 }))).toMatch(/^Renta: 1 día para/)
    expect(textoPlazoRenta(hito({ diasRestantes: 0 }))).toBe('Renta: hoy es el último día')
  })
})
