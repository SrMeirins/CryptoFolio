import { describe, expect, it } from 'vitest'
import { RADIO_MAX, RADIO_MIN, reglaPrecios } from './reglaPrecios'
import type { LotView } from './portfolioLots'

// Regla de precios de compra (#528). Datos sintéticos.
const lot = (unitCost: number, quantity: number): LotView => ({
  lotId: `${unitCost}-${quantity}`, lotIds: [`${unitCost}-${quantity}`], trozos: 1, walletId: 'w', walletName: 'W', walletColor: '#123456',
  openedAt: '2024-01-01T00:00:00Z', quantity, quantityOriginal: quantity, partial: false, unitCost, cost: unitCost * quantity,
  value: 0, pnl: null, pnlPct: null, ageDays: 1, next: false, source: 'BUY', sourceWalletName: null, sourceWalletColor: null,
})

describe('reglaPrecios', () => {
  it('reparte en beneficio y en pérdida respecto al precio actual, con su cantidad y precio medio', () => {
    const r = reglaPrecios([lot(1, 10), lot(3, 5), lot(2, 30)], 2.5, 2)!
    expect(r.beneficio).toEqual({ compras: 2, cantidad: 40, precioMedio: 1.75 })
    expect(r.perdida).toEqual({ compras: 1, cantidad: 5, precioMedio: 3 })
    expect(r.pctBeneficio).toBeCloseTo(88.89, 2)
    expect(r.log).toBe(false)
  })
  it('posiciones de barato a caro dentro de la línea, con el precio actual entre medias', () => {
    const r = reglaPrecios([lot(1, 10), lot(3, 5)], 2, null)!
    const pos = Object.fromEntries(r.circulos.map(c => [c.price, c.pos]))
    expect(pos[1]).toBeGreaterThan(0)
    expect(pos[3]).toBeLessThan(100)
    expect(pos[1]).toBeLessThan(r.posPrecio!)
    expect(r.posPrecio!).toBeLessThan(pos[3])
    expect(r.posMedio).toBeNull()
  })
  it('el radio crece con la cantidad; los grandes van primero para que los pequeños queden encima', () => {
    const r = reglaPrecios([lot(1, 1), lot(2, 100)], 1.5, null)!
    expect(r.circulos.map(c => c.quantity)).toEqual([100, 1])
    expect(r.circulos[0].radio).toBe(RADIO_MAX)
    expect(r.circulos[1].radio).toBeGreaterThanOrEqual(RADIO_MIN)
  })
  it('escala logarítmica con precios muy dispersos; sin precio no hay lados', () => {
    expect(reglaPrecios([lot(0.01, 1), lot(10, 1)], 1, null)!.log).toBe(true)
    const r = reglaPrecios([lot(1, 1)], 0, null)!
    expect(r).toMatchObject({ posPrecio: null, pctBeneficio: null })
    expect(r.circulos[0].enBeneficio).toBeNull()
    expect(reglaPrecios([], 1, null)).toBeNull()
  })
})
