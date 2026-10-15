import { describe, expect, it } from 'vitest'
import type { FifoLot, FiatBalance } from '../api/portfolio'
import type { AssetValuation } from './portfolioValuation'
import { ALLOCATION_PALETTE, NEUTRAL_COLOR, allocationByAsset, allocationByWallet, concentration } from './allocation'
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
  it('excluye las wallets por debajo del umbral de polvo', () => {
    const items = allocationByWallet([lot('BTC', '1', 'w1', '#111111'), lot('BTC', '0.001', 'w2', '#222222')], [], { BTC: 100 }, 1, 8, 1)
    expect(items.map(i => i.key)).toEqual(['w1'])
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
