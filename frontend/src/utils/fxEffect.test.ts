import { describe, expect, it } from 'vitest'
import type { FifoLot } from '../api/portfolio'
import { fxEffect, recoveryNeeded, recoveryText } from './fxEffect'

// Explicaciones del break-even y de la rentabilidad en USD (#281).
const lot = (asset: string, qty: number, costEur: number, costUsd: number | null): FifoLot => ({
  asset, wallet_id: 'w', wallet_name: 'W', wallet_color: '#123456', wallet_kind: 'exchange',
  quantity: String(qty), cost_basis_eur: String(costEur), avg_price_eur: String(costEur / qty),
  cost_basis_usd: costUsd === null ? null : String(costUsd), avg_price_usd: null,
})

describe('fxEffect', () => {
  it('el euro más débil que al comprar resta rentabilidad en USD', () => {
    // Coste 1.000 € (1.160 $ al comprar); valor 850 €; hoy 1 € = 1,12 $.
    const e = fxEffect([lot('XRP', 100, 1_000, 1_160)], { XRP: 8.5 }, 1.12)!
    expect(e.avgRate).toBeCloseTo(1.16, 10)
    expect(e.returnEur).toBeCloseTo(-15, 10)
    expect(e.returnUsd).toBeCloseTo((850 * 1.12 / 1_160 - 1) * 100, 10)
    expect(e.effectPp).toBeLessThan(0)
  })
  it('lotes sin tipo de compra usan el de hoy; sin precio o sin tipo, se ignoran', () => {
    const e = fxEffect([lot('XRP', 100, 1_000, null), lot('NEW', 1, 500, 600)], { XRP: 10 }, 1.1)!
    expect(e.avgRate).toBeCloseTo(1.1, 10)
    expect(e.effectPp).toBeCloseTo(0, 10)
    expect(fxEffect([lot('XRP', 1, 1, 1)], { XRP: 1 }, null)).toBeNull()
    expect(fxEffect([], {}, 1.1)).toBeNull()
  })
})

describe('recuperación de una caída', () => {
  it('no es simétrica', () => {
    expect(recoveryNeeded(-10)).toBeCloseTo(11.111, 3)
    expect(recoveryNeeded(-50)).toBeCloseTo(100, 10)
    expect(recoveryNeeded(0)).toBeNull()
    expect(recoveryNeeded(-100)).toBeNull()
  })
  it('texto con el ejemplo calculado', () => {
    expect(recoveryText(-10)).toMatch(/^Tras caer un 10,0%, hay que subir un 11,1%/)
  })
})
