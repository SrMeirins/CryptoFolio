import { describe, expect, it } from 'vitest'
import { legendScale, legendSteps, stepLabel } from './calendarLegend'

// Leyenda del calendario (#248).
const clean = (s: string) => s.replace(/\s/g, ' ')

describe('calendarLegend', () => {
  it('casillas simétricas de la mayor pérdida a la mayor ganancia, con 0 en el centro', () => {
    const steps = legendSteps(400)
    expect(steps).toEqual([-400, -200, -80, -20, 0, 20, 80, 200, 400])
    expect(steps[4]).toBe(0)
  })

  it('sin movimientos no hay leyenda', () => {
    expect(legendSteps(0)).toEqual([])
  })

  it('rótulos claros de la escala y de cada casilla', () => {
    expect(clean(legendScale(400, 'EUR'))).toMatch(/^Escala hasta ±400/)
    expect(clean(stepLabel(-200, 'EUR'))).toMatch(/^Pérdida de ~200/)
    expect(clean(stepLabel(80, 'EUR'))).toMatch(/^Ganancia de ~80/)
    expect(stepLabel(0, 'EUR')).toBe('Sin variación (0)')
    expect(legendScale(400, 'USD')).toContain('$')
  })
})
