import { describe, expect, it } from 'vitest'
import { decimalesPrecio, formatNumeroLocal, parseNumeroLocal } from './numeroLocal'

// Campos del simulador en formato español (#529).
describe('parseNumeroLocal', () => {
  it('acepta coma o punto decimal y separadores de miles', () => {
    expect(parseNumeroLocal('1,5')).toBe(1.5)
    expect(parseNumeroLocal('1.5')).toBe(1.5)
    expect(parseNumeroLocal('1.234,56')).toBe(1234.56)
    expect(parseNumeroLocal('1234,56')).toBe(1234.56)
    expect(parseNumeroLocal('1.234.567')).toBe(1234567)
    expect(parseNumeroLocal(' 0,000123 ')).toBe(0.000123)
  })
  it('rechaza lo que no es un número', () => {
    for (const s of ['', 'abc', '1,2,3', '12.34,5.6', '1.23.4', '1e5', '1,234.56']) expect(parseNumeroLocal(s)).toBeNull()
  })
})

describe('formatNumeroLocal', () => {
  it('formato español sin ceros sobrantes', () => {
    expect(formatNumeroLocal(1234.5)).toMatch(/^1\.?234,5$/)
    expect(formatNumeroLocal(12345.678, 2)).toBe('12.345,68')
    expect(formatNumeroLocal(0.5)).toBe('0,5')
    expect(formatNumeroLocal(2.5, 4, 2)).toBe('2,50')
    expect(formatNumeroLocal(0.123456, 6, 2)).toBe('0,123456')
    expect(parseNumeroLocal(formatNumeroLocal(98765.4321, 4))).toBe(98765.4321)
  })
  it('más decimales cuanto menor es el precio', () => {
    expect([decimalesPrecio(250), decimalesPrecio(2.5), decimalesPrecio(0.05), decimalesPrecio(0.00001)]).toEqual([2, 4, 6, 8])
  })
})
