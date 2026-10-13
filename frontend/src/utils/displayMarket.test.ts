import { describe, expect, it } from 'vitest'
import type { FifoLot } from '../api/portfolio'
import { convertLots, convertOpen24, convertPrices, liveRate } from './displayMarket'

const lot = (over: Partial<FifoLot> = {}): FifoLot => ({
  asset: 'BTC', wallet_id: 'w1', wallet_name: 'W', wallet_color: '#fff', wallet_kind: 'exchange',
  quantity: '2', cost_basis_eur: '100', avg_price_eur: '50', cost_basis_usd: '120', avg_price_usd: '60',
  ...over,
})

describe('liveRate', () => {
  it('1 en EUR; 1/USDT en USD; null sin USDT', () => {
    expect(liveRate('EUR', {})).toBe(1)
    expect(liveRate('USD', { USDT: 0.8 })).toBeCloseTo(1.25, 12)
    expect(liveRate('USD', {})).toBeNull()
    expect(liveRate('USD', { USDT: 0 })).toBeNull()
  })
})

describe('convertPrices', () => {
  it('EUR devuelve el mismo objeto (sin copias en cada tick)', () => {
    const prices = { BTC: 100 }
    expect(convertPrices(prices, 'EUR')).toBe(prices)
  })

  it('USD divide por USDT; USDT pasa a valer 1', () => {
    const usd = convertPrices({ BTC: 80_000, USDT: 0.8 }, 'USD')
    expect(usd.BTC).toBeCloseTo(100_000, 6)
    expect(usd.USDT).toBe(1)
  })

  it('USD sin precio de USDT: vacío, nunca euros etiquetados como dólares', () => {
    expect(convertPrices({ BTC: 80_000 }, 'USD')).toEqual({})
  })
})

describe('convertOpen24', () => {
  it('usa el USDT de hace 24h, de modo que la variación en USD incluye el EUR/USD', () => {
    const open = convertOpen24({ BTC: 80_000, USDT: 0.8 }, { BTC: 80_000, USDT: 0.78 }, 'USD')
    expect(open.BTC).toBeCloseTo(100_000, 6)
    // Mismo precio en EUR pero el dólar se ha depreciado: en USD sube.
    const now = convertPrices({ BTC: 80_000, USDT: 0.78 }, 'USD')
    expect(now.BTC).toBeGreaterThan(open.BTC)
  })

  it('sin USDT de hace 24h recurre al actual; EUR sin cambios', () => {
    expect(convertOpen24({ BTC: 80 }, { USDT: 0.8 }, 'USD').BTC).toBeCloseTo(100, 10)
    const o = { BTC: 1 }
    expect(convertOpen24(o, {}, 'EUR')).toBe(o)
  })
})

describe('convertLots', () => {
  it('EUR: mismos lotes', () => {
    const lots = [lot()]
    expect(convertLots(lots, 'EUR', 1)).toBe(lots)
  })

  it('USD: coste y precio medio con el tipo histórico de cada lote', () => {
    const [l] = convertLots([lot()], 'USD', 1.5)
    expect(l.cost_basis_eur).toBe('120')
    expect(l.avg_price_eur).toBe('60')
    expect(l.quantity).toBe('2')
  })

  it('USD sin coste histórico en USD: tipo en vivo; sin tipo, 0', () => {
    const [l] = convertLots([lot({ cost_basis_usd: null, avg_price_usd: undefined })], 'USD', 1.5)
    expect(parseFloat(l.cost_basis_eur)).toBeCloseTo(150, 10)
    expect(parseFloat(l.avg_price_eur)).toBeCloseTo(75, 10)
    const [z] = convertLots([lot({ cost_basis_usd: null })], 'USD', null)
    expect(z.cost_basis_eur).toBe('0')
  })
})
