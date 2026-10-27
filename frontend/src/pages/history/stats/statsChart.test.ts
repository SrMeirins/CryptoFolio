import { describe, expect, it } from 'vitest'
import type { ByCategory, HistoryStats } from '../../../api/portfolio'
import { activePeriod, chartPeriodText, chartRows, periodBreakdown, periodRange, statsParams } from './statsChart'

const cats = (over: Partial<ByCategory> = {}): ByCategory => ({
  compras: 0, ventas: 0, otras_salidas: 0, ingresos: 0, transferencias: 0, otros: 0, ...over,
})

const chart: HistoryStats['chart'] = {
  granularity: 'month', from: '2025-03-01', to: '2025-04-01',
  buckets: [
    { periodo: '2025-03', ops: cats({ compras: 2, ventas: 1 }), valor: { EUR: cats({ compras: 100, ventas: 50 }), USD: cats({ compras: 110, ventas: 55 }) } },
    { periodo: '2025-04', ops: cats(), valor: { EUR: cats(), USD: cats() } },
  ],
}

describe('chartRows (#376)', () => {
  it('modo número: recuentos y total por periodo', () => {
    const rows = chartRows(chart, 'ops', 'EUR')
    expect(rows[0]).toMatchObject({ periodo: '2025-03', compras: 2, ventas: 1, total: 3 })
    expect(rows[1].total).toBe(0)
  })

  it('modo valor: importes en la moneda pedida', () => {
    expect(chartRows(chart, 'valor', 'EUR')[0]).toMatchObject({ compras: 100, ventas: 50, total: 150 })
    expect(chartRows(chart, 'valor', 'USD')[0]).toMatchObject({ compras: 110, ventas: 55, total: 165 })
  })

  it('por años, la etiqueta es el año', () => {
    const anual = { ...chart, granularity: 'year' as const, buckets: [{ ...chart.buckets[0], periodo: '2025' }] }
    expect(chartRows(anual, 'ops', 'EUR')[0].label).toBe('2025')
  })
})

describe('chartPeriodText (#376)', () => {
  it('sin fechas: últimos 18 meses', () => {
    expect(chartPeriodText(chart, false)).toBe('últimos 18 meses')
  })

  it('con fechas: el rango y la granularidad', () => {
    expect(chartPeriodText(chart, true)).toMatch(/–.*· por meses$/)
    expect(chartPeriodText({ ...chart, granularity: 'year', from: '2021-01-01', to: '2025-01-01' }, true)).toBe('2021 – 2025 · por años')
    expect(chartPeriodText({ ...chart, granularity: 'year', from: '2025-01-01', to: '2025-01-01' }, true)).toBe('2025 · por años')
  })
})

describe('statsParams (#376)', () => {
  it('quita paginación y orden, conserva filtros y moneda', () => {
    expect(statsParams({ limit: '50', offset: '100', sort: 'valor', dir: 'asc', asset: 'BTC', currency: 'EUR', value_min: '10' }))
      .toEqual({ asset: 'BTC', currency: 'EUR', value_min: '10' })
  })
})

describe('statsParams y tarjeta (#407)', () => {
  it('la tarjeta filtra la lista, no el resumen', () => {
    expect(statsParams({ limit: '50', tarjeta: 'ventas', incluir_margen: 'true', type: 'SELL' })).toEqual({ type: 'SELL' })
  })
})

// Meses enlazables y desglose del detalle (#413). Datos sintéticos.
describe('periodRange, activePeriod y periodBreakdown (#413)', () => {
  const cats = (o: Partial<ByCategory>): ByCategory => ({ compras: 0, ventas: 0, otras_salidas: 0, ingresos: 0, transferencias: 0, otros: 0, ...o })
  const bucket = (periodo: string, ops: Partial<ByCategory>, eur: Partial<ByCategory>) =>
    ({ periodo, ops: cats(ops), valor: { EUR: cats(eur), USD: cats(eur) } })
  const chart: HistoryStats['chart'] = {
    granularity: 'month', from: '2024-01-01', to: '2024-03-31',
    buckets: [bucket('2024-02', { compras: 3, ventas: 1 }, { compras: 30, ventas: 90 }), bucket('2024-03', {}, {})],
  }

  it('rango del mes con su último día (también bisiesto) y del año', () => {
    expect(periodRange('2024-02', 'month')).toEqual({ from: '2024-02-01', to: '2024-02-29' })
    expect(periodRange('2023-02', 'month')).toEqual({ from: '2023-02-01', to: '2023-02-28' })
    expect(periodRange('2025-12', 'month')).toEqual({ from: '2025-12-01', to: '2025-12-31' })
    expect(periodRange('2025', 'year')).toEqual({ from: '2025-01-01', to: '2025-12-31' })
  })

  it('mes activo solo si el filtro es exactamente ese mes', () => {
    expect(activePeriod(chart, '2024-02-01', '2024-02-29')).toBe('2024-02')
    expect(activePeriod(chart, '2024-02-01', '2024-02-28')).toBeNull()
    expect(activePeriod(chart, '', '')).toBeNull()
  })

  it('desglose por la medida activa, sin vacías y con la dominante primero', () => {
    const porNumero = periodBreakdown(chart.buckets[0], 'ops', 'EUR')
    expect(porNumero.items.map(i => [i.category, i.share])).toEqual([['compras', 0.75], ['ventas', 0.25]])
    expect(porNumero).toMatchObject({ ops: 4, value: 120 })
    const porValor = periodBreakdown(chart.buckets[0], 'valor', 'EUR')
    expect(porValor.items[0].category).toBe('ventas')
    expect(periodBreakdown(chart.buckets[1], 'ops', 'EUR').items).toEqual([])
  })
})
