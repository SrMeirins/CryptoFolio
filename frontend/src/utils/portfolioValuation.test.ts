import { describe, expect, it } from 'vitest'
import { valuePortfolio } from './portfolioValuation'
import type { FifoLot, FiatBalance } from '../api/portfolio'

function lot(asset: string, quantity: number, cost: number, wallet = 'w1'): FifoLot {
  return {
    asset, wallet_id: wallet, wallet_name: wallet, wallet_color: '#000', wallet_kind: 'exchange',
    quantity: String(quantity), cost_basis_eur: String(cost), avg_price_eur: String(cost / quantity),
  }
}

function fiat(asset: string, balance: number, wallet = 'w1'): FiatBalance {
  return { wallet_id: wallet, wallet_name: wallet, wallet_color: '#000', wallet_kind: 'exchange', asset, balance: String(balance) }
}

describe('valuePortfolio', () => {
  it('cartera vacía: todo a cero', () => {
    const v = valuePortfolio([], {}, [])
    expect(v).toMatchObject({ cryptoValue: 0, fiatValue: 0, totalValue: 0, totalCost: 0, pnl: 0, pnlPct: 0, assetCount: 0 })
    expect(v.assets).toEqual([])
    expect(v.unpricedAssets).toEqual([])
  })

  it('solo cripto: agrega lotes del mismo activo y valora con el precio en vivo', () => {
    const v = valuePortfolio(
      [lot('XRP', 100, 50, 'w1'), lot('XRP', 50, 40, 'w2'), lot('ADA', 10, 5)],
      { XRP: 2, ADA: 0.5 },
      [],
    )
    expect(v.cryptoValue).toBe(305)
    expect(v.totalCost).toBe(95)
    expect(v.pnl).toBe(210)
    expect(v.pnlPct).toBeCloseTo(221.0526, 3)
    expect(v.assetCount).toBe(2)
    expect(v.assets.map(a => [a.asset, a.quantity, a.value])).toEqual([['XRP', 150, 300], ['ADA', 10, 5]])
  })

  it('cripto y fiat: el fiat suma al valor total pero no cuenta como P&L', () => {
    const v = valuePortfolio([lot('XRP', 100, 150)], { XRP: 2 }, [fiat('EUR', 500, 'w1'), fiat('EUR', 100, 'w2')])
    expect(v.fiatValue).toBe(600)
    expect(v.totalValue).toBe(800)
    expect(v.pnl).toBe(50)              // 200 − 150, sin el saldo en EUR
    expect(v.assets.find(a => a.asset === 'EUR')).toMatchObject({ kind: 'fiat', value: 600 })
  })

  it('activos sin precio: valor 0, su coste cuenta y se listan aparte', () => {
    const v = valuePortfolio([lot('XRP', 100, 150), lot('RARO', 5, 20)], { XRP: 2 }, [])
    expect(v.cryptoValue).toBe(200)
    expect(v.totalCost).toBe(170)
    expect(v.unpricedAssets).toEqual(['RARO'])
    expect(v.assets.find(a => a.asset === 'RARO')).toMatchObject({ price: null, value: 0 })
  })

  it('un precio 0 o negativo se trata como sin precio', () => {
    const v = valuePortfolio([lot('XRP', 1, 1), lot('ADA', 1, 1)], { XRP: 0, ADA: -1 }, [])
    expect(v.unpricedAssets.sort()).toEqual(['ADA', 'XRP'])
    expect(v.cryptoValue).toBe(0)
  })

  it('los activos se devuelven ordenados por valor descendente', () => {
    const v = valuePortfolio([lot('A', 1, 1), lot('B', 1, 1)], { A: 1, B: 3 }, [fiat('EUR', 2)])
    expect(v.assets.map(a => a.asset)).toEqual(['B', 'EUR', 'A'])
  })
})
