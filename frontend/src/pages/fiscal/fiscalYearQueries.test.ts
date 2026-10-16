import { describe, expect, it } from 'vitest'
import { fiscalYearQueries, prefetchOrder } from './fiscalYearQueries'

// Precarga de ejercicios fiscales (#295).
describe('prefetchOrder', () => {
  it('todos menos el activo, los más próximos primero', () => {
    expect(prefetchOrder([2026, 2025, 2024, 2023, 2022], 2024)).toEqual([2025, 2023, 2026, 2022])
    expect(prefetchOrder([2026, 2025], 2026)).toEqual([2025])
    expect(prefetchOrder([2024, 2026, 2025], null)).toEqual([2026, 2025, 2024])
  })
})

describe('fiscalYearQueries', () => {
  it('claves por año, distintas entre años', () => {
    const a = fiscalYearQueries(2024), b = fiscalYearQueries(2025)
    expect(a.summary.queryKey).toEqual(['fiscal-summary-detail', 2024])
    expect(Object.values(a).map(q => q.queryKey.join())).not.toEqual(Object.values(b).map(q => q.queryKey.join()))
  })
})
