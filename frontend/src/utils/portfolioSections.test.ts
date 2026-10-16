import { describe, expect, it } from 'vitest'
import type { FifoLot, FiatBalance } from '../api/portfolio'
import { isDust, portfolioSections } from './portfolioSections'

// Secciones de Portfolio (#269): wallets sin tablas vacías y polvo en un único bloque.
const lot = (asset: string, wallet: string, kind: string, quantity: number, cost = quantity): FifoLot => ({
  asset, wallet_id: wallet, wallet_name: `W ${wallet}`, wallet_color: '#123456', wallet_kind: kind,
  quantity: String(quantity), cost_basis_eur: String(cost), avg_price_eur: '1',
})
const fiat = (asset: string, wallet: string, balance: number): FiatBalance =>
  ({ asset, wallet_id: wallet, wallet_name: `W ${wallet}`, wallet_color: '#123456', balance: String(balance) }) as FiatBalance

const prices = { XRP: 2, BTC: 50_000, BNB: 500 }

describe('portfolioSections', () => {
  const lots = [
    lot('XRP', 'cold', 'software', 1_000),     // 2.000 €
    lot('XRP', 'spot', 'exchange', 0.2),       // 0,40 € → polvo en spot
    lot('BNB', 'spot', 'exchange', 0.0002),    // 0,10 € → polvo
    lot('BTC', 'funding', 'exchange', 0.00001), // 0,50 € → polvo
    lot('NEW', 'cold', 'software', 5),         // sin precio
  ]

  it('las wallets que solo tienen polvo no generan sección', () => {
    const s = portfolioSections(lots, prices, [], 1, 1)
    expect(s.sections.map(x => x.walletId)).toEqual(['cold'])
    expect(s.sections[0].rows.map(r => r.asset)).toEqual(['XRP', 'NEW'])
  })

  it('el polvo se reúne en un bloque, por posición y de mayor a menor valor', () => {
    const s = portfolioSections(lots, prices, [], 1, 1)
    expect(s.dust.map(r => `${r.asset}@${r.wallets[0].wallet_id}`)).toEqual(['BTC@funding', 'XRP@spot', 'BNB@spot'])
    expect(s.dustValue).toBeCloseTo(1, 9)
  })

  it('el total es el de toda la cartera, para que «% cartera» sea global', () => {
    expect(portfolioSections(lots, prices, [fiat('EUR', 'spot', 100)], 1, 1).total).toBeCloseTo(2_101, 6)
  })

  it('los activos sin precio se listan una vez y nunca son polvo', () => {
    const s = portfolioSections(lots, prices, [], 1, 1)
    expect(s.unpriced).toEqual(['NEW'])
    expect(s.dust.some(r => r.asset === 'NEW')).toBe(false)
  })

  it('autocustodia primero y exchanges después; saldo fiat crea su sección', () => {
    const s = portfolioSections([lot('XRP', 'spot', 'exchange', 100), lot('XRP', 'cold', 'software', 100)], prices, [fiat('EUR', 'bank', 50)], 1, 1)
    expect(s.sections.map(x => x.walletId)).toEqual(['cold', 'spot', 'bank'])
  })
})

describe('isDust', () => {
  it('fiat por debajo del umbral es polvo; a cero, no', () => {
    expect(isDust({ kind: 'fiat', asset: 'EUR', quantity: 0.5, price: 1, value: 0.5, wallets: [] }, {}, 1)).toBe(true)
    expect(isDust({ kind: 'fiat', asset: 'EUR', quantity: 0, price: 1, value: 0, wallets: [] }, {}, 1)).toBe(false)
  })
})
