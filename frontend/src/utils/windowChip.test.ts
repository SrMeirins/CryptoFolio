import { describe, expect, it } from 'vitest'
import { WINDOW_LABELS, todayChip, toneOf } from './windowChip'

// Chips «Hoy» y «24 h» de las tarjetas de resumen (#247).
const clean = (s: string | undefined) => s?.replace(/\s/g, ' ')   // Intl usa espacios duros

describe('todayChip', () => {
  it('importe con signo y redondeado, con la ventana en el nombre accesible', () => {
    expect(todayChip(12.345, 'EUR')).toMatchObject({ tone: 'positive' })
    expect(clean(todayChip(12.345, 'EUR')?.text)).toBe('+12,35 €')
    expect(clean(todayChip(12.345, 'EUR')?.aria)).toBe('Hoy: +12,35 €')
    expect(clean(todayChip(-3.2, 'EUR')?.text)).toBe('-3,20 €')
    expect(todayChip(-3.2, 'EUR')?.tone).toBe('negative')
  })

  it('por debajo de medio céntimo es neutro y sin signo (nunca «-0,00 €»)', () => {
    expect(todayChip(0.001, 'EUR')).toMatchObject({ tone: 'neutral' })
    expect(clean(todayChip(-0.004, 'EUR')?.text)).toBe('0,00 €')
  })

  it('sin dato no hay chip; en USD usa su moneda', () => {
    expect(todayChip(null, 'EUR')).toBeNull()
    expect(todayChip(5, 'USD')?.text).toContain('$')
  })
})

describe('toneOf', () => {
  it('positivo, negativo o neutro con un umbral de medio céntimo', () => {
    expect(toneOf(0.01)).toBe('positive')
    expect(toneOf(-0.01)).toBe('negative')
    expect(toneOf(0.004)).toBe('neutral')
  })
})

describe('WINDOW_LABELS', () => {
  it('etiquetas visibles distintas y una explicación de cada ventana', () => {
    expect(WINDOW_LABELS.today.label).toBe('Hoy')
    expect(WINDOW_LABELS['24h'].label).toBe('24 h')
    expect(WINDOW_LABELS.today.help).toMatch(/00:00/)
    expect(WINDOW_LABELS['24h'].help).toMatch(/24 horas/)
  })
})
