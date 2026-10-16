import { describe, expect, it } from 'vitest'
import type { OpenLot } from '../api/portfolio'
import { curvePrices, pctOfWallet, priceScenarios, qtyForPct, saleBreakEven, walletBreakEven } from './saleSimulatorView'

// Simulador rediseñado (#280).
const lot = (wallet: string, qty: number, unit: number): OpenLot => ({
  wallet_id: wallet, wallet_name: wallet, wallet_color: '#123456', wallet_kind: 'exchange', opened_at: '2024-01-01T00:00:00Z',
  quantity_original: String(qty), quantity_remaining: String(qty), price_per_unit_eur: String(unit), cost_basis_eur: String(qty * unit),
  usd_per_eur: null, source_type: 'BUY',
})

describe('cantidad por %', () => {
  it('25/50/75/100 % sin ruido de coma flotante, y el % de una cantidad para el deslizador', () => {
    expect(qtyForPct(3088.5300507, 50)).toBe(1544.26502535)
    expect(qtyForPct(10, 100)).toBe(10)
    expect(pctOfWallet(25, 100)).toBe(25)
    expect(pctOfWallet(150, 100)).toBe(100)
    expect(pctOfWallet(1, 0)).toBe(0)
  })
})

describe('walletBreakEven', () => {
  it('precio medio de los lotes de esa wallet', () => {
    const lots = [lot('a', 10, 1), lot('a', 10, 3), lot('b', 5, 100)]
    expect(walletBreakEven(lots, 'a')).toBe(2)
    expect(walletBreakEven(lots, 'c')).toBeNull()
  })
})

describe('saleBreakEven', () => {
  it('con el coste de los lotes que se venden, cubriendo la comisión', () => {
    // Vender 10 cuyo coste FIFO es 30 (no el medio de la wallet) con 1 % de comisión.
    expect(saleBreakEven(30, 10, 1)).toBeCloseTo(3 / 0.99, 10)
    expect(saleBreakEven(30, 10, 0)).toBe(3)
    expect(saleBreakEven(0, 10, 0)).toBeNull()
    expect(saleBreakEven(30, 0, 0)).toBeNull()
  })
})

describe('priceScenarios', () => {
  it('actual, break-even de la venta, +10 % y +25 %', () => {
    const s = priceScenarios(2, 1.5)
    expect(s.map(x => x.key)).toEqual(['actual', 'breakeven', 'p10', 'p25'])
    expect(s[1].price).toBe(1.5)
    expect(s[2].price).toBeCloseTo(2.2, 10)
    expect(s[3].price).toBeCloseTo(2.5, 10)
  })
  it('sin precio actual, solo el break-even', () => {
    expect(priceScenarios(0, 1.5).map(x => x.key)).toEqual(['breakeven'])
  })
})

describe('curvePrices', () => {
  it('de 0 a 2× el mayor de actual y break-even', () => {
    const p = curvePrices(1, 3, 4)
    expect(p).toEqual([0, 1.5, 3, 4.5, 6])
    expect(curvePrices(0, null)).toEqual([])
  })
})
