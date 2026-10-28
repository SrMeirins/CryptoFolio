import { describe, expect, it } from 'vitest'
import { validateRate, validateThreshold } from './settingsValidation'

// Validación de los ajustes de Fiscal (#445).
describe('validateThreshold', () => {
  it('acepta enteros en rango', () => {
    expect(validateThreshold('50000')).toEqual({ ok: true, value: 50000 })
    expect(validateThreshold(' 25000 ')).toEqual({ ok: true, value: 25000 })
  })

  it('rechaza vacíos, decimales, texto y fuera de rango', () => {
    for (const raw of ['', '50.000,5', 'abc', '-5', '0', '10000001']) expect(validateThreshold(raw).ok).toBe(false)
  })
})

describe('validateRate', () => {
  it('acepta coma o punto decimal', () => {
    expect(validateRate('19')).toEqual({ ok: true, value: 19 })
    expect(validateRate('21,5')).toEqual({ ok: true, value: 21.5 })
    expect(validateRate('100')).toEqual({ ok: true, value: 100 })
  })

  it('rechaza 0, negativos, más de 100 y texto', () => {
    for (const raw of ['0', '-1', '100.1', '', 'x', '1e2']) expect(validateRate(raw).ok).toBe(false)
  })
})
