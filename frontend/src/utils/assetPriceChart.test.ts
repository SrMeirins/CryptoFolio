import { describe, expect, it } from 'vitest'
import { axisPrice, chartMarkers, labelSide, priceSeries, rangeDays, rangeStats, totalReturn } from './assetPriceChart'
import type { AssetSale } from '../api/portfolio'

// Gráfico de precio y rentabilidad total del panel de detalle (#284). Datos sintéticos.
const NOW = new Date('2026-01-31T10:00:00Z')

describe('rangeDays', () => {
  it('rangos fijos', () => {
    expect(rangeDays('30d', null)).toBe(30)
    expect(rangeDays('90d', null)).toBe(90)
    expect(rangeDays('1y', null)).toBe(365)
  })
  it('«Todo» desde la primera compra, con tope de 400 días', () => {
    expect(rangeDays('all', '2026-01-01T10:00:00Z', NOW)).toBe(31)
    expect(rangeDays('all', '2020-01-01T10:00:00Z', NOW)).toBe(400)
    expect(rangeDays('all', '2026-01-31T09:00:00Z', NOW)).toBe(2)
    expect(rangeDays('all', null, NOW)).toBe(365)
  })
})

describe('priceSeries y rangeStats', () => {
  const closes = [{ date: '2026-01-28', price: 2 }, { date: '2026-01-29', price: 3 }, { date: '2026-01-30', price: 1 }]
  it('convierte a la moneda elegida y añade el precio en vivo al final', () => {
    const s = priceSeries(closes, 1.5, 2, NOW)
    expect(s.map(p => p.price)).toEqual([4, 6, 2, 3])
    expect(s[3].t).toBe(NOW.getTime())
    expect(priceSeries(closes, undefined, 1, NOW)).toHaveLength(3)
  })
  it('máximo, mínimo y variación del rango', () => {
    const st = rangeStats(priceSeries(closes, 1.5, 1, NOW))
    expect(st?.max.price).toBe(3)
    expect(st?.min.price).toBe(1)
    expect(st?.changePct).toBeCloseTo(-25, 9)
    expect(rangeStats([{ t: 0, price: 1 }])).toBeNull()
  })
})

describe('chartMarkers', () => {
  const sale = (soldAt: string, quantity: number, priceEur: number): AssetSale =>
    ({ soldAt, kind: 'venta', quantity, priceEur, proceedsEur: quantity * priceEur, gainLossEur: 0 })
  it('agrupa por día y tipo con precio medio ponderado, y filtra fuera del rango', () => {
    const from = Date.parse('2026-01-10T12:00:00Z')
    const m = chartMarkers(
      [
        { openedAt: '2026-01-15T08:00:00Z', quantity: 10, unitCost: 1 },
        { openedAt: '2026-01-15T20:00:00Z', quantity: 30, unitCost: 2 },
        { openedAt: '2025-12-01T08:00:00Z', quantity: 5, unitCost: 1 }, // fuera del rango
      ],
      [sale('2026-01-20T10:00:00Z', 4, 3)],
      from, 2,
    )
    expect(m).toHaveLength(2)
    expect(m[0]).toMatchObject({ kind: 'compra', quantity: 40, price: 1.75 })
    expect(m[1]).toMatchObject({ kind: 'venta', quantity: 4, price: 6 })
  })
})

describe('totalReturn', () => {
  it('suma el realizado convertido y el no realizado', () => {
    expect(totalReturn(100, -40, 1)).toEqual({ realized: 100, unrealized: -40, total: 60 })
    expect(totalReturn(100, 10, 1.1).total).toBeCloseTo(120, 9)
    expect(totalReturn(100, null, 1).total).toBeNull()
  })
})

describe('eje y etiquetas', () => {
  it('precios cortos en el eje', () => {
    expect(axisPrice(0.8, 'EUR')).toBe('0,8 €')
    expect(axisPrice(0.012345, 'EUR')).toBe('0,0123 €')
    expect(axisPrice(1.5, 'USD')).toBe('1,50 $')
    expect(axisPrice(64250.4, 'EUR')).toBe('64.250 €')
  })
  it('las etiquetas de los extremos se apartan del borde', () => {
    expect(labelSide(0, 0, 100)).toBe('right')
    expect(labelSide(50, 0, 100)).toBe('center')
    expect(labelSide(95, 0, 100)).toBe('left')
    expect(labelSide(5, 5, 5)).toBe('center')
  })
})
