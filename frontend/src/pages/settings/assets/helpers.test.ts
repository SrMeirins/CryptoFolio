import { describe, expect, it } from 'vitest'
import { cumpleFiltro, fmtPrice } from './helpers'

// Activos: filtros por estado del precio y formato (#337). Datos sintéticos.
const a = (over: Partial<Parameters<typeof cumpleFiltro>[0]>) => ({ is_stablecoin: false, price_source: 'eur_direct', ...over })

describe('cumpleFiltro', () => {
  it('sin precio: sin fuente, o en cartera sin precio en vivo; nunca estables', () => {
    expect(cumpleFiltro(a({ price_source: 'unknown' }), null, 'sin_precio')).toBe(true)
    expect(cumpleFiltro(a({ price_source: 'eth_proxy', en_cartera: true }), null, 'sin_precio')).toBe(true)
    expect(cumpleFiltro(a({ price_source: 'eth_proxy', en_cartera: true }), 3000, 'sin_precio')).toBe(false)
    expect(cumpleFiltro(a({ price_source: 'eur_direct', en_cartera: false }), null, 'sin_precio')).toBe(false)
    expect(cumpleFiltro(a({ is_stablecoin: true, price_source: 'unknown' }), null, 'sin_precio')).toBe(false)
  })
  it('solo CoinGecko y con respaldo', () => {
    expect(cumpleFiltro(a({ price_source: 'coingecko' }), 1, 'solo_coingecko')).toBe(true)
    expect(cumpleFiltro(a({ fuente_actual: 'okx' }), 1, 'respaldo')).toBe(true)
    expect(cumpleFiltro(a({ fuente_actual: 'binance' }), 1, 'respaldo')).toBe(false)
    expect(cumpleFiltro(a({}), null, 'todos')).toBe(true)
  })
})

describe('fmtPrice', () => {
  it('precios muy pequeños sin notación científica', () => {
    expect(fmtPrice(0.0000094963)).toBe('€0,0000094963')
    expect(fmtPrice(2.5)).toBe('€2,5000')
  })
})
