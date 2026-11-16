import { describe, expect, it } from 'vitest'
import type { CryptoRow, FiatRow } from './assetTable'
import { sortRows } from './assetTable'
import { breakEvenBar, columnTotals, desdeMaximo, edadCorta, metricsByAsset, realizadoPorActivo, rowMetrics } from './positionMetrics'

const venta = (eur: number, operations = 1) => [{ categoria: 'ventas' as const, eur, operations }]

// Métricas de las columnas nuevas (#527). Datos sintéticos.
const crypto = (asset: string, qty: number, cost: number, price: number, firstOpenedAt: number | null = null): CryptoRow =>
  ({ kind: 'crypto', asset, value: qty * price, totalQuantity: qty, totalCostBasis: cost, avgPrice: cost / qty, wallets: [], firstOpenedAt })
const fiat: FiatRow = { kind: 'fiat', asset: 'EUR', quantity: 50, price: 1, value: 50, wallets: [] }
const now = new Date('2026-06-01T00:00:00Z')

describe('rowMetrics', () => {
  const row = crypto('AAA', 10, 100, 12, Date.parse('2026-05-02T00:00:00Z'))
  const ctx = {
    prices: { AAA: 12 * 1.1 }, pricesEur: { AAA: 12 }, rate: 1.1, now,
    realizadoEur: new Map([['AAA', [{ categoria: 'ventas' as const, eur: 40, operations: 3 }, { categoria: 'comisiones' as const, eur: 10, operations: 2 }]]]),
    ingresosEur: new Map([['AAA', { total: 20, operations: 4 }]]),
    cierres90: { AAA: [{ price: 10 }, { price: 16 }, { price: 11 }] },
  }
  it('resultado total: no realizado más realizado al cambio de hoy', () => {
    const m = rowMetrics(crypto('AAA', 10, 100, 13.2), ctx)
    expect(m.realizado).toBeCloseTo(55, 9)
    expect(m.resultado).toBeCloseTo(132 - 100 + 55, 9)
    expect(m.noRealizado).toBeCloseTo(32, 9)
    expect(m.realizadoPartes.map(p => [p.categoria, Math.round(p.value * 100) / 100, p.operations])).toEqual([['ventas', 44, 3], ['comisiones', 11, 2]])
  })
  it('sin precio, sin resultado; sin ventas, realizado 0', () => {
    expect(rowMetrics(row, { ...ctx, prices: {} }).resultado).toBeNull()
    expect(rowMetrics(row, { ...ctx, realizadoEur: new Map() }).realizado).toBe(0)
  })
  it('antigüedad desde la compra abierta más antigua', () => {
    expect(rowMetrics(row, ctx).ageDays).toBe(30)
    expect(rowMetrics(crypto('AAA', 1, 1, 1), ctx).ageDays).toBeNull()
  })
  it('desde máximo: con el precio en vivo, en la moneda mostrada', () => {
    const m = rowMetrics(row, ctx)
    expect(m.desdeMaximo?.pct).toBeCloseTo(-25, 9)
    expect(m.desdeMaximo?.max).toBeCloseTo(17.6, 9)
  })
  it('ingresos convertidos con su número de rentas', () => {
    const ing = rowMetrics(row, ctx).ingresos
    expect(ing?.value).toBeCloseTo(22, 9)
    expect(ing?.operations).toBe(4)
  })
})

describe('realizadoPorActivo', () => {
  it('agrupa por activo en el orden ventas, permutas, comisiones y otros', () => {
    const m = realizadoPorActivo([
      { asset: 'A', categoria: 'otros', operations: 1, net_eur: -1 },
      { asset: 'A', categoria: 'comisiones', operations: 4, net_eur: -2 },
      { asset: 'A', categoria: 'ventas', operations: 2, net_eur: 30 },
      { asset: 'B', categoria: 'permutas', operations: 1, net_eur: 5 },
    ])
    expect(m.get('A')?.map(p => p.categoria)).toEqual(['ventas', 'comisiones', 'otros'])
    expect(m.get('B')).toEqual([{ categoria: 'permutas', eur: 5, operations: 1 }])
  })
})

describe('desdeMaximo', () => {
  it('el precio en vivo por encima de los cierres es el máximo: 0 %', () => {
    expect(desdeMaximo([{ price: 5 }], 6)).toEqual({ pct: 0, maxEur: 6 })
  })
  it('sin cierres o sin precio, null', () => {
    expect(desdeMaximo([], 6)).toBeNull()
    expect(desdeMaximo([{ price: 5 }], 0)).toBeNull()
    expect(desdeMaximo(undefined, 6)).toBeNull()
  })
})

describe('columnTotals', () => {
  it('suma coste de todas las cripto y resultado e ingresos de las que tienen dato', () => {
    const rows = [crypto('A', 1, 100, 150), crypto('B', 1, 40, 0), fiat]
    const metrics = metricsByAsset(rows, { prices: { A: 150 }, pricesEur: { A: 150 }, rate: 1, realizadoEur: new Map([['B', venta(10)]]) })
    expect(columnTotals(rows, metrics)).toEqual({ coste: 140, resultado: 50, ingresos: null })
  })
})

describe('breakEvenBar', () => {
  it('en pérdida: el coste al final de la escala y el precio antes', () => {
    expect(breakEvenBar(50, 100)).toEqual({ cost: 1, price: 0.5, up: false })
  })
  it('en beneficio: el precio al final y el coste antes', () => {
    expect(breakEvenBar(200, 100)).toEqual({ cost: 0.5, price: 1, up: true })
  })
  it('sin precio o sin coste, null', () => {
    expect(breakEvenBar(0, 100)).toBeNull()
    expect(breakEvenBar(10, 0)).toBeNull()
  })
})

describe('edadCorta', () => {
  it('días, meses y años con meses', () => {
    expect(edadCorta(12)).toBe('12 d')
    expect(edadCorta(153)).toBe('5 m')
    expect(edadCorta(365)).toBe('1 a')
    expect(edadCorta(1000)).toBe('2 a 8 m')
  })
})

describe('sortRows con las columnas nuevas', () => {
  const rows = [crypto('A', 1, 100, 150, Date.parse('2026-01-01T00:00:00Z')), crypto('B', 1, 100, 90, Date.parse('2025-01-01T00:00:00Z')), crypto('C', 1, 1, 0), fiat]
  const metrics = metricsByAsset(rows, { prices: { A: 150, B: 90 }, pricesEur: { A: 150, B: 90 }, rate: 1, now, realizadoEur: new Map([['B', venta(100)]]) })
  it('por resultado total, sin dato al final en ambas direcciones', () => {
    expect(sortRows(rows, 'resultado', 'desc', {}, 1, metrics).map(r => r.asset)).toEqual(['B', 'A', 'C', 'EUR'])
    expect(sortRows(rows, 'resultado', 'asc', {}, 1, metrics).map(r => r.asset).slice(0, 2)).toEqual(['A', 'B'])
    expect(sortRows(rows, 'resultado', 'asc', {}, 1, metrics).map(r => r.asset).slice(2).sort()).toEqual(['C', 'EUR'])
  })
  it('por antigüedad, la más antigua primero en descendente', () => {
    expect(sortRows(rows, 'antiguedad', 'desc', {}, 1, metrics).map(r => r.asset).slice(0, 2)).toEqual(['B', 'A'])
  })
})
