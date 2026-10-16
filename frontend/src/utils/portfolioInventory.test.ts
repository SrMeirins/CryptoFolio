import { describe, expect, it } from 'vitest'
import type { FifoLot, FiatBalance, LockedAmount } from '../api/portfolio'
import { portfolioInventory } from './portfolioInventory'

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
