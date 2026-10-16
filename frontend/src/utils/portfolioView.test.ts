import { describe, expect, it } from 'vitest'
import type { FifoLot, FiatBalance } from '../api/portfolio'
import { assetView, breakEvenDistance, filterByPnl, rowPnl } from './portfolioView'
import { portfolioSections } from './portfolioSections'

// Vista «Por activo» y filtros de Portfolio (#271).
const lot = (asset: string, wallet: string, quantity: number, cost: number): FifoLot => ({
  asset, wallet_id: wallet, wallet_name: `W ${wallet}`, wallet_color: '#123456', wallet_kind: 'exchange',
  quantity: String(quantity), cost_basis_eur: String(cost), avg_price_eur: String(cost / quantity),
})
const fiat = (balance: number): FiatBalance =>
  ({ asset: 'EUR', wallet_id: 'spot', wallet_name: 'W spot', wallet_color: '#123456', wallet_kind: 'exchange', balance: String(balance) })
const prices = { XRP: 2, ADA: 0.5, BNB: 500 }

describe('breakEvenDistance', () => {
  it('por encima del precio medio: en beneficio, nada que recuperar', () => {
    expect(breakEvenDistance(2.2, 2)).toEqual({ pct: expect.closeTo(10, 9), toRecover: 0 })
  })
  it('por debajo: subida necesaria para recuperar lo invertido', () => {
    const d = breakEvenDistance(1, 2)!
    expect(d.pct).toBeCloseTo(-50, 9)
    expect(d.toRecover).toBeCloseTo(100, 9)   // de 1 a 2 hay que subir un 100 %
  })
  it('sin precio o sin coste, null', () => {
    expect(breakEvenDistance(0, 2)).toBeNull()
    expect(breakEvenDistance(2, 0)).toBeNull()
  })
})

describe('assetView', () => {
  const lots = [lot('XRP', 'cold', 1_000, 1_500), lot('XRP', 'spot', 0.2, 0.3), lot('ADA', 'cold', 100, 80), lot('BNB', 'spot', 0.0002, 0.08)]

  it('una fila por activo con todas sus wallets; el resto pequeño de una wallet queda dentro', () => {
    const v = assetView(lots, prices, [], 1, 1)
    expect(v.rows.map(r => r.asset)).toEqual(['XRP', 'ADA'])
    const xrp = v.rows[0]
    expect(xrp.kind === 'crypto' && xrp.totalQuantity).toBeCloseTo(1_000.2, 9)
    expect(xrp.wallets.map(w => w.wallet_id)).toEqual(['cold', 'spot'])
  })

  it('el polvo se decide sobre el total del activo', () => {
    const v = assetView(lots, prices, [], 1, 1)
    expect(v.dust.map(r => r.asset)).toEqual(['BNB'])
    expect(v.dustValue).toBeCloseTo(0.1, 9)
  })
})

describe('filterByPnl', () => {
  const v = assetView([lot('XRP', 'cold', 1_000, 1_500), lot('ADA', 'cold', 100, 80), lot('NEW', 'cold', 5, 5)], prices, [fiat(100)], 1, 1)

  it('ganancia y pérdida; las filas sin P&L (fiat, sin precio) solo con «Todos»', () => {
    expect(filterByPnl(v.rows, 'gain', prices).map(r => r.asset)).toEqual(['XRP'])     // 2.000 > 1.500
    expect(filterByPnl(v.rows, 'loss', prices).map(r => r.asset)).toEqual(['ADA'])     // 50 < 80
    expect(filterByPnl(v.rows, 'all', prices)).toHaveLength(4)
  })

  it('rowPnl: null para fiat y activos sin precio', () => {
    expect(rowPnl(v.rows.find(r => r.asset === 'EUR')!, prices)).toBeNull()
    expect(rowPnl(v.rows.find(r => r.asset === 'NEW')!, prices)).toBeNull()
    expect(rowPnl(v.rows.find(r => r.asset === 'XRP')!, prices)).toBeCloseTo(500, 9)
  })
})

describe('vistas Por activo y Por wallet', () => {
  it('suman lo mismo (filas más polvo) que el total de la cartera', () => {
    const lots = [lot('XRP', 'cold', 1_000, 1_500), lot('XRP', 'spot', 0.2, 0.3), lot('ADA', 'cold', 100, 80), lot('BNB', 'spot', 0.0002, 0.08)]
    const fiats = [fiat(100)]
    const sum = (rows: { value: number }[]) => rows.reduce((s, r) => s + r.value, 0)
    const a = assetView(lots, prices, fiats, 1, 1)
    const w = portfolioSections(lots, prices, fiats, 1, 1)
    const byAsset = sum(a.rows) + a.dustValue
    const byWallet = w.sections.reduce((s, x) => s + sum(x.rows), 0) + w.dustValue
    expect(byAsset).toBeCloseTo(w.total, 9)
    expect(byWallet).toBeCloseTo(w.total, 9)
  })
})
