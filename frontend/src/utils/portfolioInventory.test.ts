import { describe, expect, it } from 'vitest'
import type { FifoLot, FiatBalance, LockedAmount } from '../api/portfolio'
import { distinctHues, portfolioInventory, walletComposition } from './portfolioInventory'

// Inventario de Portfolio (#270).
const lot = (asset: string, wallet: string, kind: string, quantity: number): FifoLot => ({
  asset, wallet_id: wallet, wallet_name: `W ${wallet}`, wallet_color: '#123456', wallet_kind: kind,
  quantity: String(quantity), cost_basis_eur: '0', avg_price_eur: '0',
})
const fiat = (wallet: string, kind: string, balance: number): FiatBalance =>
  ({ asset: 'EUR', wallet_id: wallet, wallet_name: `W ${wallet}`, wallet_color: '#123456', wallet_kind: kind, balance: String(balance) })
const lock = (asset: string, amount: number): LockedAmount =>
  ({ asset, wallet_id: 'spot', wallet_name: 'W spot', wallet_color: '#123456', staking_type: 'Simple Earn', lock_kind: 'staking', locked_amount: String(amount) })

const prices = { XRP: 2, BTC: 50_000 }

describe('portfolioInventory', () => {
  const inv = portfolioInventory(
    [lot('XRP', 'cold', 'hardware', 3_000), lot('XRP', 'spot', 'exchange', 500), lot('BTC', 'spot', 'exchange', 0.02)],
    prices, [fiat('spot', 'exchange', 1_000)], 1, [lock('XRP', 200)],
  )

  it('custodia: exchanges frente a autocustodia, con el fiat de exchange incluido', () => {
    expect(inv.total).toBeCloseTo(9_000, 6)                       // 6.000 + 1.000 + 1.000 + 1.000
    expect(inv.custody.exchange).toBeCloseTo(3_000, 6)
    expect(inv.custody.self).toBeCloseTo(6_000, 6)
    expect(inv.custody.exchangePct).toBeCloseTo(33.333, 2)
  })

  it('posiciones: activos distintos, wallets y el activo de mayor peso', () => {
    expect(inv.positions).toMatchObject({ assets: 3, wallets: 2 })
    expect(inv.positions.top?.asset).toBe('XRP')
    expect(inv.positions.top?.pct).toBeCloseTo(77.78, 2)            // 7.000 / 9.000
  })

  it('bloqueado: valor de lo bloqueado al precio actual', () => {
    expect(inv.locked).toEqual({ value: 400, assets: 1 })
  })

  it('tarjetas de wallet de mayor a menor valor, con % y nº de activos', () => {
    expect(inv.wallets.map(w => [w.walletId, Math.round(w.value), w.assetCount])).toEqual([['cold', 6_000, 1], ['spot', 3_000, 3]])
    expect(inv.wallets[0].pct).toBeCloseTo(66.67, 2)
  })

  it('cartera vacía o sin precios: sin divisiones por cero', () => {
    const empty = portfolioInventory([], {}, [], 1, [])
    expect(empty.custody.exchangePct).toBe(0)
    expect(empty.positions.top).toBeNull()
    expect(portfolioInventory([lot('NEW', 'cold', 'hardware', 5)], {}, [], 1, []).positions.top).toBeNull()
  })
})

// Composición, P&L y antigüedad media por wallet (#283). Datos sintéticos.
describe('walletComposition', () => {
  const values = new Map([['A', 500], ['B', 300], ['C', 100], ['D', 50], ['E', 40], ['DUST', 0.5]])
  const total = 990.5
  it('4 principales y el resto (con el polvo) en «otros»; suma el valor de la wallet', () => {
    const c = walletComposition(values, total, 1)
    expect(c.top.map(p => p.asset)).toEqual(['A', 'B', 'C', 'D'])
    expect(c.others.value).toBeCloseTo(40.5, 9)
    expect(c.others.count).toBe(1)          // E; el polvo no cuenta
    expect(c.assetCount).toBe(5)
    expect(c.top.reduce((s, p) => s + p.value, 0) + c.others.value).toBeCloseTo(total, 9)
    expect(c.top.reduce((s, p) => s + p.pct, 0) + c.others.pct).toBeCloseTo(100, 9)
  })
  it('una wallet con solo polvo lo muestra', () => {
    const c = walletComposition(new Map([['X', 0.1], ['Y', 0.04]]), 0.14, 1)
    expect(c.top.map(p => p.asset)).toEqual(['X', 'Y'])
    expect(c.assetCount).toBe(2)
    expect(c.others).toEqual({ value: 0, pct: 0, count: 0 })
  })
})

describe('portfolioInventory: P&L y antigüedad media (#283)', () => {
  const dated = (asset: string, wallet: string, quantity: number, cost: number, at: string | null): FifoLot =>
    ({ ...lot(asset, wallet, 'hardware', quantity), cost_basis_eur: String(cost), avg_opened_at: at })
  const inv = portfolioInventory(
    [dated('XRP', 'cold', 1_000, 1_000, '2024-01-01T00:00:00Z'), dated('BTC', 'cold', 0.01, 3_000, '2024-01-31T00:00:00Z'), dated('NOPRICE', 'cold', 5, 50, null)],
    prices, [], 1, [], 1,
  )
  const cold = inv.wallets[0]
  it('P&L solo de las posiciones con precio', () => {
    expect(cold.pnl).toBeCloseTo(2_000 + 500 - 4_000, 6)
    expect(cold.pnlPct).toBeCloseTo(-37.5, 6)
  })
  it('fecha media ponderada por coste, en la wallet y en la cartera', () => {
    expect(new Date(cold.avgOpenedAt!).toISOString()).toBe('2024-01-23T12:00:00.000Z')
    expect(inv.avgOpenedAt).toBe(cold.avgOpenedAt)
  })
  it('sin coste ni fechas: null', () => {
    const empty = portfolioInventory([lot('XRP', 'cold', 'hardware', 1)], prices, [], 1, [])
    expect(empty.wallets[0].pnl).toBeNull()
    expect(empty.avgOpenedAt).toBeNull()
  })
})

describe('distinctHues (#283)', () => {
  it('conserva los tonos separados y desplaza los que chocan', () => {
    expect(distinctHues([10, 120, 240])).toEqual([10, 120, 240])
    const h = distinctHues([80, 85, 90])
    expect(h[0]).toBe(80)
    for (let i = 0; i < h.length; i++) for (let j = i + 1; j < h.length; j++) {
      const d = Math.abs(h[i] - h[j]) % 360
      expect(Math.min(d, 360 - d)).toBeGreaterThanOrEqual(45)
    }
  })
})
