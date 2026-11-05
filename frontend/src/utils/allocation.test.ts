import { describe, expect, it } from 'vitest'
import type { FifoLot, FiatBalance } from '../api/portfolio'
import type { AssetValuation } from './portfolioValuation'
import { ALLOCATION_PALETTE, NEUTRAL_COLOR, allocationByAsset, allocationByWallet, assetColors, concentration } from './allocation'
import { valuePortfolio } from './portfolioValuation'
import { contrastRatio } from './contrast'

// Distribución de la cartera (#235).
const asset = (a: string, value: number, extra: Partial<AssetValuation> = {}): AssetValuation =>
  ({ asset: a, kind: 'crypto', quantity: 1, cost: 0, price: value, value, ...extra })

describe('allocationByAsset', () => {
  it('de mayor a menor, con %, colores de la paleta y variación 24 h', () => {
    const items = allocationByAsset([asset('B', 100), asset('A', 300, { price: 300 }), asset('EUR', 100, { kind: 'fiat', price: 1 })], { A: 250 })
    expect(items.map(i => i.key)).toEqual(['A', 'B', 'EUR'])
    expect(items[0]).toMatchObject({ pct: 60, color: ALLOCATION_PALETTE[0], kind: 'crypto' })
    expect(items[0].change24h).toBeCloseTo(20, 9)
    expect(items[1].change24h).toBeNull()
    expect(items[2]).toMatchObject({ kind: 'fiat', color: NEUTRAL_COLOR, change24h: null })
  })
  it('más de 8: los 8 mayores y «Otros» con su contenido; con 9 no se agrupa uno solo', () => {
    const many = Array.from({ length: 12 }, (_, i) => asset(`A${i}`, 100 - i))
    const items = allocationByAsset(many, {})
    expect(items).toHaveLength(9)
    expect(items[8]).toMatchObject({ key: '__otros', label: 'Otros', kind: 'other' })
    expect(items[8].members.map(m => m.label)).toEqual(['A8', 'A9', 'A10', 'A11'])
    expect(items.reduce((s, i) => s + i.pct, 0)).toBeCloseTo(100, 9)
    expect(allocationByAsset(many.slice(0, 9), {})).toHaveLength(9)
  })
  it('ignora el polvo sin valor; sin valor no hay elementos', () => {
    expect(allocationByAsset([asset('A', 0)], {})).toEqual([])
  })
})

describe('allocationByWallet', () => {
  const lot = (asset: string, q: string, wallet: string, color: string) =>
    ({ asset, quantity: q, wallet_id: wallet, wallet_name: wallet.toUpperCase(), wallet_color: color }) as FifoLot
  it('suma los lotes a precio actual y el efectivo de cada wallet, con su color', () => {
    const items = allocationByWallet(
      [lot('BTC', '1', 'w1', '#111111'), lot('XRP', '100', 'w2', '#222222'), lot('BTC', '0.5', 'w2', '#222222')],
      [{ wallet_id: 'w1', wallet_name: 'W1', wallet_color: '#111111', wallet_kind: 'exchange', asset: 'EUR', balance: '50' } as FiatBalance],
      { BTC: 100, XRP: 1 },
    )
    expect(items.map(i => [i.key, i.value, i.color])).toEqual([['w1', 150, '#111111'], ['w2', 150, '#222222']])
    expect(items[0].pct).toBe(50)
  })
  it('las wallets por debajo del umbral de polvo van a «Otros», sin perder valor (#506)', () => {
    const items = allocationByWallet([lot('BTC', '1', 'w1', '#111111'), lot('BTC', '0.001', 'w2', '#222222')], [], { BTC: 100 }, 1, 8, 1)
    expect(items.map(i => i.key)).toEqual(['w1', '__otros'])
    expect(items[1].members.map(m => m.label)).toEqual(['W2'])
    expect(items.reduce((s, i) => s + i.value, 0)).toBeCloseTo(100.1, 9)
    expect(items.reduce((s, i) => s + i.pct, 0)).toBeCloseTo(100, 9)
  })

  it('mismo total que la vista por activo y que valuePortfolio (#506)', () => {
    const lots = [lot('BTC', '1', 'w1', '#111111'), lot('XRP', '100', 'w2', '#222222'), lot('BTC', '0.5', 'w2', '#222222'),
      lot('ADA', '3', 'w3', '#333333'), lot('SIN', '9', 'w1', '#111111')] // SIN: sin precio, vale 0 en ambas
    const fiat = [{ wallet_id: 'w1', wallet_name: 'W1', wallet_color: '#111111', wallet_kind: 'exchange', asset: 'EUR', balance: '50' } as FiatBalance]
    const prices = { BTC: 100, XRP: 1, ADA: 0.1 }
    const v = valuePortfolio(lots, prices, fiat, 1)
    const porWallet = allocationByWallet(lots, fiat, prices, 1, 8, 1, assetColors(v.assets))
    const porActivo = allocationByAsset(v.assets, {})
    const suma = (xs: { value: number }[]) => xs.reduce((s, x) => s + x.value, 0)
    expect(suma(porWallet)).toBeCloseTo(v.totalValue, 9)
    expect(suma(porActivo)).toBeCloseTo(v.totalValue, 9)
  })

  it('desglose por activo de cada wallet: suma su valor, con los colores de la vista por activo', () => {
    const lots = [lot('BTC', '1', 'w1', '#111111'), lot('XRP', '100', 'w1', '#111111')]
    const v = valuePortfolio(lots, { BTC: 100, XRP: 1 }, [], 1)
    const colors = assetColors(v.assets)
    const [w1] = allocationByWallet(lots, [], { BTC: 100, XRP: 1 }, 1, 8, 0, colors)
    expect(w1.breakdown.map(b => [b.label, b.value, b.color])).toEqual([['BTC', 100, colors.get('BTC')], ['XRP', 100, colors.get('XRP')]])
    expect(w1.breakdown.reduce((s, b) => s + b.pct, 0)).toBeCloseTo(100, 9)
  })

  it('más de 6 activos en una wallet: los 5 mayores y «Otros»', () => {
    const lots = Array.from({ length: 8 }, (_, i) => lot(`A${i}`, String(10 - i), 'w1', '#111111'))
    const prices = Object.fromEntries(lots.map(l => [l.asset, 1]))
    const [w1] = allocationByWallet(lots, [], prices)
    expect(w1.breakdown.map(b => b.label)).toEqual(['A0', 'A1', 'A2', 'A3', 'A4', 'Otros'])
    expect(w1.breakdown.at(-1)?.value).toBe(5 + 4 + 3)
  })
})

describe('concentration', () => {
  it('avisa del activo que supera el 40 % (sin contar efectivo ni «Otros»)', () => {
    expect(concentration(allocationByAsset([asset('XRP', 41), asset('B', 59 / 2), asset('C', 59 / 2)], {}))?.key).toBe('XRP')
    expect(concentration(allocationByAsset([asset('A', 30), asset('B', 35), asset('C', 35)], {}))).toBeNull()
    expect(concentration(allocationByAsset([asset('EUR', 90, { kind: 'fiat' }), asset('B', 10)], {}))).toBeNull()
  })
})

describe('paleta', () => {
  it('contraste ≥ 3:1 sobre la tarjeta en ambos temas (elementos gráficos, WCAG 1.4.11)', () => {
    for (const c of [...ALLOCATION_PALETTE, NEUTRAL_COLOR]) {
      expect(contrastRatio(c, '#1e2130')).toBeGreaterThanOrEqual(3)
      expect(contrastRatio(c, '#ffffff')).toBeGreaterThanOrEqual(3)
    }
  })
})
