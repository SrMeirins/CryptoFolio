import { describe, expect, it } from 'vitest'
import { adjacentYear, cuotaAhorro, madridMonthDay, parseVista, yearComparison } from './fiscalHeader'

// Cabecera y navegación de Fiscal (#297). Datos sintéticos.
describe('parseVista', () => {
  it('valores válidos y caída en Resumen', () => {
    expect(parseVista('operaciones')).toBe('operaciones')
    expect(parseVista('modelo721')).toBe('modelo721')
    expect(parseVista(null)).toBe('resumen')
    expect(parseVista('<script>')).toBe('resumen')
  })
})

describe('adjacentYear', () => {
  const years = [2026, 2025, 2024]
  it('izquierda y derecha según el orden del selector', () => {
    expect(adjacentYear(years, 2025, -1)).toBe(2026)
    expect(adjacentYear(years, 2025, 1)).toBe(2024)
    expect(adjacentYear(years, 2026, -1)).toBeNull()
    expect(adjacentYear(years, 2024, 1)).toBeNull()
    expect(adjacentYear(years, 1999, 1)).toBeNull()
  })
})

describe('cuotaAhorro', () => {
  it('tramos del ahorro y tipo medio', () => {
    expect(cuotaAhorro(6_000).cuota).toBeCloseTo(1_140, 6)
    const r = cuotaAhorro(10_000)
    expect(r.cuota).toBeCloseTo(1_140 + 840, 6)
    expect(r.tipoMedio).toBeCloseTo(19.8, 6)
    expect(cuotaAhorro(-50)).toEqual({ cuota: 0, tipoMedio: 0 })
  })
})

describe('madridMonthDay', () => {
  it('el día de Madrid, no el de UTC', () => {
    expect(madridMonthDay(new Date('2026-06-14T21:30:00Z'))).toBe('06-14')
    expect(madridMonthDay(new Date('2026-06-14T22:30:00Z'))).toBe('06-15')
    expect(madridMonthDay(new Date('2025-12-31T23:30:00Z'))).toBe('01-01')
  })
})

describe('yearComparison', () => {
  it('año en curso: mismo periodo y sin comparar la cuota', () => {
    expect(yearComparison({ year: 2026, esAnioEnCurso: true, neto: 120, cuota: 22.8, prevNeto: 70, prevCuota: 500 }))
      .toEqual({ label: '2025 a estas alturas', netoDelta: 50, cuotaDelta: null })
  })
  it('año cerrado: año completo y cuota comparada', () => {
    const c = yearComparison({ year: 2025, esAnioEnCurso: false, neto: 1000, cuota: 190, prevNeto: 400, prevCuota: 76 })
    expect(c?.label).toBe('2024')
    expect(c?.netoDelta).toBe(600)
    expect(c?.cuotaDelta).toBeCloseTo(114, 9)
  })
  it('sin año anterior: null', () => {
    expect(yearComparison({ year: 2022, esAnioEnCurso: false, neto: 1, cuota: 0, prevNeto: null, prevCuota: null })).toBeNull()
  })
})
