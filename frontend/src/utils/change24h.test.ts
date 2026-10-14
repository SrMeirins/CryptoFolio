import { describe, expect, it } from 'vitest'
import { computeChange24h } from './change24h'
import type { AssetValuation } from './portfolioValuation'

function crypto(asset: string, quantity: number, price: number | null): AssetValuation {
  return { asset, kind: 'crypto', quantity, cost: 0, price, value: price === null ? 0 : quantity * price }
}

function fiat(asset: string, balance: number): AssetValuation {
  return { asset, kind: 'fiat', quantity: balance, cost: balance, price: 1, value: balance }
}

describe('computeChange24h', () => {
  it('cobertura total: variación en € y % respecto al valor de hace 24h', () => {
    const r = computeChange24h([crypto('XRP', 100, 2.2), crypto('ADA', 10, 0.5)], { XRP: 2, ADA: 0.5 })
    expect(r.status).toBe('ok')
    if (r.status !== 'ok') return
    expect(r.eur).toBeCloseTo(20, 10)        // 220 + 5 − (200 + 5)
    expect(r.pct).toBeCloseTo(20 / 205 * 100, 10)
    expect(r.excluded).toEqual([])
  })

  it('el saldo fiat cuenta en la base pero no varía', () => {
    const r = computeChange24h([crypto('XRP', 100, 2.2), fiat('EUR', 795)], { XRP: 2 })
    if (r.status !== 'ok') throw new Error('se esperaba ok')
    expect(r.eur).toBeCloseTo(20, 10)
    expect(r.pct).toBeCloseTo(20 / 995 * 100, 10) // base de hace 24h: 200 € cripto + 795 € fiat
  })

  it('cobertura parcial: calcula con lo cubierto y lista los activos sin precio de hace 24h', () => {
    const r = computeChange24h([crypto('XRP', 100, 2.2), crypto('NFT', 1000, 0.01)], { XRP: 2 })
    if (r.status !== 'ok') throw new Error('se esperaba ok')
    expect(r.eur).toBeCloseTo(20, 10)
    expect(r.excluded).toEqual(['NFT'])
  })

  it('una stablecoin con apertura igual al precio aporta variación 0', () => {
    const r = computeChange24h([crypto('XRP', 100, 2.2), crypto('USDC', 100, 0.9)], { XRP: 2, USDC: 0.9 })
    if (r.status !== 'ok') throw new Error('se esperaba ok')
    expect(r.eur).toBeCloseTo(20, 10)
  })

  it('los activos sin precio actual se ignoran (no tienen valor)', () => {
    const r = computeChange24h([crypto('XRP', 100, 2.2), crypto('RARO', 5, null)], { XRP: 2 })
    if (r.status !== 'ok') throw new Error('se esperaba ok')
    expect(r.excluded).toEqual([])
  })

  it('sin precios en vivo: no disponible (esperando precios)', () => {
    expect(computeChange24h([crypto('XRP', 100, null)], {})).toEqual({ status: 'unavailable', reason: 'no-prices' })
    expect(computeChange24h([], {})).toEqual({ status: 'unavailable', reason: 'no-prices' })
  })

  it('con precios pero sin ninguna referencia de hace 24h: no disponible', () => {
    expect(computeChange24h([crypto('XRP', 100, 2.2)], {})).toEqual({ status: 'unavailable', reason: 'no-reference' })
  })
})

describe('computeChange24h — efecto divisa del saldo fiat en USD (#184)', () => {
  // En USD el saldo de 100 € vale hoy 100 × 1,10 $ = 110 $; hace 24h 1 € valía 1,08 $.
  const eurInUsd = (balance: number, rate: number): AssetValuation =>
    ({ asset: 'EUR', kind: 'fiat', quantity: balance, cost: balance * rate, price: rate, value: balance * rate })

  it('una cartera solo con EUR refleja el movimiento del EUR/USD', () => {
    const r = computeChange24h([eurInUsd(100, 1.1)], {}, 1.08)
    if (r.status !== 'ok') throw new Error('se esperaba ok')
    expect(r.eur).toBeCloseTo(2, 10)                 // 110 − 108
    expect(r.pct).toBeCloseTo(2 / 108 * 100, 10)
  })

  it('con cripto y EUR suma ambos efectos', () => {
    const r = computeChange24h([crypto('XRP', 100, 2.2), eurInUsd(100, 1.1)], { XRP: 2 }, 1.08)
    if (r.status !== 'ok') throw new Error('se esperaba ok')
    expect(r.eur).toBeCloseTo(22, 10)                // 20 (XRP) + 2 (EUR)
  })

  it('sin tipo de hace 24h el fiat no varía, como antes', () => {
    const r = computeChange24h([crypto('XRP', 100, 2.2), eurInUsd(100, 1.1)], { XRP: 2 }, null)
    if (r.status !== 'ok') throw new Error('se esperaba ok')
    expect(r.eur).toBeCloseTo(20, 10)
  })

  it('en EUR (fiatOpen24 = 1) el resultado es idéntico al anterior', () => {
    const assets = [crypto('XRP', 100, 2.2), fiat('EUR', 795)]
    const before = computeChange24h(assets, { XRP: 2 })
    const now = computeChange24h(assets, { XRP: 2 }, 1)
    expect(now).toEqual(before)
  })

  it('una cartera solo con fiat sin movimiento de tipo sigue sin variación disponible', () => {
    expect(computeChange24h([fiat('EUR', 100)], {}, 1)).toEqual({ status: 'unavailable', reason: 'no-prices' })
  })
})
