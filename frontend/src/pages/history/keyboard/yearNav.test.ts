import { describe, expect, it } from 'vitest'
import { historyYearLink, selectedYear, stepYear, yearRange } from './yearNav'
import { parseHistoryUrl } from '../urlState'

describe('yearNav (#382)', () => {
  it('un año es su rango completo de días locales', () => {
    expect(yearRange(2025)).toEqual({ from: '2025-01-01', to: '2025-12-31' })
  })

  it('el enlace desde Fiscal abre el Historial con ese año elegido', () => {
    const url = historyYearLink(2025)
    expect(url).toBe('/history?desde=2025-01-01&hasta=2025-12-31')
    const { filters } = parseHistoryUrl(new URLSearchParams(url.split('?')[1]))
    expect(selectedYear(filters.date_from, filters.date_to)).toBe(2025)
  })

  it('reconoce un año completo y nada más', () => {
    expect(selectedYear('2025-01-01', '2025-12-31')).toBe(2025)
    expect(selectedYear('2025-01-01', '2025-12-30')).toBeNull()
    expect(selectedYear('2025-01-01', '2026-12-31')).toBeNull()
    expect(selectedYear('', '')).toBeNull()
  })

  const years = [2023, 2024, 2025, 2026]

  it('con año: anterior y siguiente, y null en los extremos', () => {
    expect(stepYear(years, 2025, '2025-01-01', -1)).toBe(2024)
    expect(stepYear(years, 2025, '2025-01-01', 1)).toBe(2026)
    expect(stepYear(years, 2023, '2023-01-01', -1)).toBeNull()
    expect(stepYear(years, 2026, '2026-01-01', 1)).toBeNull()
  })

  it('sin año: anterior va al más reciente; siguiente no hace nada', () => {
    expect(stepYear(years, null, '', -1)).toBe(2026)
    expect(stepYear(years, null, '', 1)).toBeNull()
  })

  it('con un rango personalizado, anterior va al año de su inicio si tiene datos', () => {
    expect(stepYear(years, null, '2024-03-15', -1)).toBe(2024)
    expect(stepYear(years, null, '2019-03-15', -1)).toBe(2026)
  })

  it('un año elegido sin datos salta al contiguo con datos', () => {
    expect(stepYear([2021, 2024], 2023, '2023-01-01', -1)).toBe(2021)
    expect(stepYear([2021, 2024], 2023, '2023-01-01', 1)).toBe(2024)
  })

  it('sin años con datos no hay salto', () => {
    expect(stepYear([], null, '', -1)).toBeNull()
  })
})
