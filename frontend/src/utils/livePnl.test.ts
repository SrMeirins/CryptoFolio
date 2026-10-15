import { describe, expect, it } from 'vitest'
import type { LiveDayBase } from '../api/portfolio'
import { liveDayPnl } from './livePnl'

// P&L de hoy en vivo (#213): misma identidad que el servidor con cada tick.
const base: LiveDayBase = {
  date: '2026-07-02',
  previousValue: 100,
  holdings: { BTC: 1, EUR: 50 },
  flows: [{ asset: 'EUR', quantity: 50 }],
  pricesEur: { BTC: 120, USDT: 0.8 },
}

describe('liveDayPnl', () => {
  it('reproduce el cálculo del servidor con sus mismos precios', () => {
    // 170 − 100 − 50 = 20, sobre una base de 150.
    const r = liveDayPnl(base, {}, 'EUR')
    expect(r?.value).toBeCloseTo(170)
    expect(r?.pnl).toBeCloseTo(20)
    expect(r?.pct).toBeCloseTo(13.3333, 3)
  })

  it('se mueve con cada precio en vivo, sin esperar al servidor', () => {
    expect(liveDayPnl(base, { BTC: 90 }, 'EUR')?.pnl).toBeCloseTo(-10)
    expect(liveDayPnl(base, { BTC: 130 }, 'EUR')?.pnl).toBeCloseTo(30)
  })

  it('un depósito o una retirada de hoy no cambia el P&L', () => {
    const sinFlujos = liveDayPnl({ ...base, holdings: { BTC: 1 }, flows: [] }, { BTC: 130 }, 'EUR')
    const retirada = liveDayPnl({ ...base, holdings: { BTC: 0.5 }, flows: [{ asset: 'BTC', quantity: -0.5 }] }, { BTC: 130 }, 'EUR')
    expect(sinFlujos?.pnl).toBeCloseTo(30)
    expect(retirada?.pnl).toBeCloseTo(30)
  })

  it('en USD convierte con el USDT en vivo (o el del servidor si aún no hay)', () => {
    const usdBase = { ...base, previousValue: 125 }   // 100 € a 0,8 € por USDT
    expect(liveDayPnl(usdBase, { BTC: 120, USDT: 0.8 }, 'USD')?.value).toBeCloseTo(212.5)
    expect(liveDayPnl(usdBase, {}, 'USD')?.pnl).toBeCloseTo(212.5 - 125 - 62.5)
    expect(liveDayPnl({ ...usdBase, pricesEur: { BTC: 120 } }, {}, 'USD')).toBeNull()
  })

  it('excluye los activos sin precio y no da % con una base menor de 1', () => {
    const r = liveDayPnl({ ...base, holdings: { BTC: 1, XYZ: 5 } }, {}, 'EUR')
    expect(r?.value).toBeCloseTo(120)
    expect(liveDayPnl({ date: 'x', previousValue: 0, holdings: { BTC: 0.001 }, flows: [], pricesEur: { BTC: 120 } }, {}, 'EUR')?.pct).toBeNull()
  })
})
