import { describe, expect, it } from 'vitest'
import { feedDescription, indicatorLabel, liveRateText, relativeAge } from './liveIndicator'

// Indicador de estado de la cabecera (#200).
const now = 1_000_000

describe('indicador de estado', () => {
  it('antigüedad legible', () => {
    expect(relativeAge(2_400)).toBe('hace 2 s')
    expect(relativeAge(185_000)).toBe('hace 3 min')
    expect(relativeAge(3_700_000)).toBe('hace 1 h')
    expect(relativeAge(-50)).toBe('hace 0 s')
  })

  it('los tres estados, con el tiempo desde la última actualización si está en vivo', () => {
    expect(indicatorLabel('live', now - 2_000, now)).toBe('En vivo · hace 2 s')
    expect(indicatorLabel('live', null, now)).toBe('En vivo')
    expect(indicatorLabel('stale', now - 90_000, now)).toBe('Sin actualizaciones')
    expect(indicatorLabel('offline', now, now)).toBe('Offline')
  })

  it('estado del feed en el tooltip, con el motivo si no llegan precios', () => {
    expect(feedDescription({ status: 'live', pairs: 36, binanceConnected: true })).toBe('Binance conectado · 36 pares')
    expect(feedDescription({ status: 'live', pairs: 1, binanceConnected: true })).toBe('Binance conectado · 1 par')
    expect(feedDescription({ status: 'live', pairs: null, binanceConnected: null })).toBe('Binance conectado')
    expect(feedDescription({ status: 'stale', pairs: 36, binanceConnected: true })).toMatch(/36 pares, pero no llegan precios nuevos/)
    expect(feedDescription({ status: 'stale', pairs: 36, binanceConnected: false })).toMatch(/no está conectado a Binance/)
    expect(feedDescription({ status: 'offline', pairs: 36, binanceConnected: true })).toMatch(/Sin conexión con el servidor/)
  })

  it('tipo EUR/USD en vivo a partir del precio de USDT en EUR', () => {
    expect(liveRateText(0.8915)).toBe('1 € = 1,1217 $ · vía USDT, en vivo')
    expect(liveRateText(undefined)).toMatch(/aún no disponible/)
    expect(liveRateText(0)).toMatch(/aún no disponible/)
  })
})
