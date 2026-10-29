import { describe, expect, it } from 'vitest'
import { comparativaSeries, desgloseSeries, filtersFromUrl, mensualSeries, monthRange, tramosScale } from './fiscalCharts'
import { TRAMOS_DEFAULT } from './tramosIrpf'

// Gráficos de Fiscal (#301). Datos sintéticos.
describe('comparativaSeries', () => {
  it('orden cronológico y pérdidas en negativo', () => {
    const s = comparativaSeries([
      { year: 2025, esAnioEnCurso: true, totalGanancias: 10, totalPerdidas: -4, netoPatrimonial: 6, numOperaciones: 2, totalRendimientos: 0 },
      { year: 2024, esAnioEnCurso: false, totalGanancias: 0, totalPerdidas: 30, netoPatrimonial: -30, numOperaciones: 1, totalRendimientos: 0 },
    ])
    expect(s.map(x => x.year)).toEqual([2024, 2025])
    expect(s[0].perdidas).toBe(-30)
    expect(s[1]).toMatchObject({ ganancias: 10, perdidas: -4, neto: 6, enCurso: true })
  })
})

describe('mensualSeries', () => {
  it('12 meses con los futuros vacíos', () => {
    const s = mensualSeries([{ mes: 1, label: 'ene', netoMes: 5, acumulado: 5 }, { mes: 2, label: 'feb', netoMes: -2, acumulado: 3 }])
    expect(s).toHaveLength(12)
    expect(s[1]).toMatchObject({ label: 'feb', neto: -2, acumulado: 3, futuro: false })
    expect(s[2]).toMatchObject({ neto: null, acumulado: null, futuro: true })
  })
})

describe('desgloseSeries', () => {
  const item = (asset: string, g: number, p: number) => ({ asset, ganancias: g, perdidas: p, neto: g + p, operaciones: 1 })
  it('8 principales por movimiento y el resto en «Otros»', () => {
    const items = Array.from({ length: 11 }, (_, i) => item(`A${i}`, i, -i))
    const s = desgloseSeries(items)
    expect(s).toHaveLength(9)
    expect(s[0].asset).toBe('A10')
    const otros = s[8]
    expect(otros).toMatchObject({ asset: 'Otros', otros: 3, ganancias: 0 + 1 + 2, perdidas: -(0 + 1 + 2), operaciones: 3 })
    // Los totales se conservan.
    expect(s.reduce((a, r) => a + r.neto, 0)).toBeCloseTo(items.reduce((a, r) => a + r.neto, 0), 9)
  })
  it('sin «Otros» si caben todos', () => {
    expect(desgloseSeries([item('X', 1, 0)]).map(r => r.asset)).toEqual(['X'])
  })
})

describe('monthRange', () => {
  it('primer y último día, también en febrero bisiesto', () => {
    expect(monthRange(2024, 2)).toEqual({ desde: '2024-02-01', hasta: '2024-02-29' })
    expect(monthRange(2025, 12)).toEqual({ desde: '2025-12-01', hasta: '2025-12-31' })
  })
})

describe('tramosScale', () => {
  it('base en el primer tramo: dos peldaños de igual ancho', () => {
    const s = tramosScale(3_000, TRAMOS_DEFAULT)
    expect(s.segments.map(x => x.tipo)).toEqual([19, 21])
    expect(s.segments.map(x => x.widthPct)).toEqual([50, 50])
    expect(s.segments[0]).toMatchObject({ base: 3_000, activo: true, fillPct: 50 })
    expect(s.segments[0].cuota).toBeCloseTo(570, 9)
    expect(s.markerPct).toBeCloseTo(25, 9)
    expect(s.siguiente).toEqual({ faltan: 3_000, tipo: 21 })
  })
  it('base en el segundo tramo: el primero lleno y el marcador dentro del segundo', () => {
    const s = tramosScale(28_000, TRAMOS_DEFAULT)
    expect(s.segments.map(x => x.tipo)).toEqual([19, 21, 23])
    expect(s.segments[0].fillPct).toBe(100)
    expect(s.segments[1].fillPct).toBeCloseTo(50, 9)
    expect(s.markerPct).toBeCloseTo(100 / 3 + 50 / 3, 9)
    expect(s.segments.reduce((a, x) => a + x.base, 0)).toBeCloseTo(28_000, 6)
  })
  it('base en el último tramo, sin techo: sin siguiente', () => {
    const s = tramosScale(400_000, TRAMOS_DEFAULT)
    expect(s.siguiente).toBeNull()
    expect(s.segments).toHaveLength(5)
    expect(s.segments.reduce((a, x) => a + x.base, 0)).toBeCloseTo(400_000, 6)
  })
  it('base nula', () => {
    expect(tramosScale(0, TRAMOS_DEFAULT)).toMatchObject({ markerPct: 0, siguiente: null })
  })
})

describe('filtersFromUrl', () => {
  it('acepta fechas y símbolos válidos e ignora el resto', () => {
    expect(filtersFromUrl(new URLSearchParams('desde=2025-03-01&hasta=2025-03-31&activo=XRP'))).toEqual({ from: '2025-03-01', to: '2025-03-31', asset: 'XRP' })
    expect(filtersFromUrl(new URLSearchParams('desde=ayer&activo=<script>'))).toEqual({})
  })

  it('resultado: ganancia o pérdida; cualquier otro valor se ignora (#418)', () => {
    expect(filtersFromUrl(new URLSearchParams('resultado=ganancia'))).toEqual({ result: 'gain' })
    expect(filtersFromUrl(new URLSearchParams('resultado=perdida'))).toEqual({ result: 'loss' })
    expect(filtersFromUrl(new URLSearchParams('resultado=todo'))).toEqual({})
  })
})
