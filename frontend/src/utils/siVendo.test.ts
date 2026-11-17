import { describe, expect, it } from 'vitest'
import type { SimulationResult } from '../api/portfolio'
import { parseSellQuantity, shareQuantity, siVendoResumen } from './siVendo'

// «Si vendo X» (#528): resume la respuesta del simulador sin recalcular nada.
const sim = (lots: Array<[string, string, number, boolean]>): SimulationResult => ({
  asset: 'SINT', quantity: 15, priceEur: 2, feePct: 0.1, walletId: 'w', wallets: [],
  totalProceeds: 30, totalFee: 0.03, netProceeds: 29.97, totalCostBasis: 20, totalGain: 10, totalLoss: 0, netGainLoss: 9.97,
  irpfEstimate: 0, irpf: { year: 2026, baseAntes: 0, baseDespues: 0, marginal: 0, desglose: [] }, recompra: { aviso: false, comprasRecientes: [] },
  netoEnMano: 29.97, resultadoNeto: 9.97,
  lotsConsumed: lots.map(([lotId, openedAt, qtyConsumed, partial]) => ({
    lotId, walletName: 'W', openedAt, qtyAvailable: 10, qtyConsumed, costBasisConsumed: 0, pricePerUnit: 1, proceedsEur: 0, feeEur: 0, partial, gainLossEur: 0,
  })),
})

describe('siVendoResumen', () => {
  it('toma los lotes y cifras del simulador tal cual (mismo cálculo, #529)', () => {
    const r = siVendoResumen(sim([['a', '2024-01-01T00:00:00Z', 10, false], ['b', '2024-02-01T00:00:00Z', 5, true], ['c', '2024-03-01T00:00:00Z', 0, false]]))
    expect([...r.lotIds]).toEqual(['a', 'b'])
    expect(r).toMatchObject({ lots: 2, partial: true, firstOpenedAt: '2024-01-01T00:00:00Z', lastOpenedAt: '2024-02-01T00:00:00Z',
      proceedsEur: 30, costEur: 20, feeEur: 0.03, resultEur: 9.97 })
  })
})

describe('cantidad a vender', () => {
  it('porcentajes de la posición; el 100 % es exacto', () => {
    expect(shareQuantity(0.3, 100)).toBe(0.3)
    expect(shareQuantity(10, 25)).toBe(2.5)
    expect(shareQuantity(0, 50)).toBe(0)
  })
  it('acepta coma decimal, recorta al máximo y rechaza lo no válido', () => {
    expect(parseSellQuantity('1,5', 10)).toBe(1.5)
    expect(parseSellQuantity('99', 10)).toBe(10)
    expect(parseSellQuantity('0', 10)).toBeNull()
    expect(parseSellQuantity('abc', 10)).toBeNull()
    expect(parseSellQuantity('-2', 10)).toBeNull()
  })
})
