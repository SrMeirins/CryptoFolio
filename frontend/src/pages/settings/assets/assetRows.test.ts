import { describe, expect, it } from 'vitest'
import type { AssetMetadata } from '../../../api/portfolio'
import { matchesFilter, priceHealth, priceState, sortAssets } from './assetRows'

// Tabla de Activos (#450). Datos sintéticos.
const a = (symbol: string, over: Partial<AssetMetadata> = {}): AssetMetadata => ({
  symbol, name: symbol, coingecko_id: null, is_stablecoin: false, binance_eur_pair: null, binance_usdt_pair: null, binance_btc_pair: null,
  price_source: 'eur_direct', auto_detected: false, last_price_check: null, ...over,
} as AssetMetadata)

describe('assetRows', () => {
  it('estado del precio según la fuente en vivo', () => {
    expect(priceState(a('A'), 1)).toBe('binance')
    expect(priceState(a('B', { price_source: 'coingecko', fuente_actual: 'coingecko' }), 1)).toBe('coingecko')
    expect(priceState(a('C', { fuente_actual: 'okx' }), 1)).toBe('respaldo')
    expect(priceState(a('D'), null)).toBe('sin-precio')
    expect(priceState(a('E', { price_source: 'unknown' }), 5)).toBe('sin-precio')
    expect(priceState(a('USDT', { is_stablecoin: true }), null)).toBe('estable')
  })

  it('la salud cuenta por estado y toma el fallo más reciente', () => {
    const list = [
      a('A'), a('D'),
      a('F', { ultimo_fallo: { source: 'coingecko', reason: 'sin-precio', at: '2026-01-01T10:00:00Z' } }),
      a('G', { ultimo_fallo: { source: 'coinpaprika', reason: 'sin-respuesta', at: '2026-01-02T10:00:00Z' } }),
      a('USDT', { is_stablecoin: true }),
    ]
    const h = priceHealth(list, x => (x.symbol === 'A' ? 1 : null))
    expect(h.counts).toEqual({ binance: 1, coingecko: 0, respaldo: 0, 'sin-precio': 3 })
    expect(h.lastFailure).toMatchObject({ symbol: 'G', source: 'coinpaprika' })
    expect(priceHealth([a('A')], () => 1).lastFailure).toBeNull()
  })

  it('el filtro «Estables y fiat» y los de estado conviven', () => {
    expect(matchesFilter(a('USDT', { is_stablecoin: true }), null, 'estables')).toBe(true)
    expect(matchesFilter(a('A'), 1, 'estables')).toBe(false)
    expect(matchesFilter(a('E', { price_source: 'unknown' }), null, 'sin_precio')).toBe(true)
  })

  it('ordena por columna; sin precio al final y empates por símbolo', () => {
    const list = [a('B'), a('A'), a('C')]
    const price = (x: AssetMetadata) => ({ A: 5, B: 1 } as Record<string, number>)[x.symbol]
    expect(sortAssets(list, 'precio', 'asc', price).map(x => x.symbol)).toEqual(['B', 'A', 'C'])
    expect(sortAssets(list, 'precio', 'desc', price).map(x => x.symbol)).toEqual(['A', 'B', 'C'])
    expect(sortAssets(list, 'activo', 'desc', price).map(x => x.symbol)).toEqual(['C', 'B', 'A'])
    const uso = [a('X', { operaciones: 3 }), a('Y', { operaciones: 0, en_cartera: true }), a('Z', { operaciones: 9 })]
    expect(sortAssets(uso, 'uso', 'desc', () => 1).map(x => x.symbol)).toEqual(['Y', 'Z', 'X'])
  })
})
