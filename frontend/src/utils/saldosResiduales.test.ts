import { describe, expect, it } from 'vitest'
import { descuadre, fichasRestos, repartirRecibido, valorResto } from './saldosResiduales'
import type { CryptoRow } from './assetTable'

// Saldos residuales (#530). Datos sintéticos.
const now = new Date('2026-11-17T00:00:00Z')
const row = (asset: string, value: number, wallets: Array<[string, number]>, diasAtras: number | null): CryptoRow => ({
  kind: 'crypto', asset, value, totalQuantity: wallets.reduce((s, [, q]) => s + q, 0), totalCostBasis: 0, avgPrice: 0,
  wallets: wallets.map(([w, q]) => ({ wallet_id: w, wallet_name: `W ${w}`, wallet_color: '#123456', wallet_kind: 'exchange', quantity: q, costBasis: 0 })),
  firstOpenedAt: diasAtras === null ? null : now.getTime() - diasAtras * 86_400_000,
})

describe('fichasRestos', () => {
  it('una ficha por activo y wallet, con su parte del valor, de más a menos valor', () => {
    const f = fichasRestos([row('SINTA', 0.3, [['a', 1], ['b', 2]], 10), row('SINTB', 0.5, [['a', 5]], 400)], now)
    expect(f.map(x => [x.key, +x.value.toFixed(2)])).toEqual([['SINTB|a', 0.5], ['SINTA|b', 0.2], ['SINTA|a', 0.1]])
  })
  it('marca de antigüedad para restos de más de un año', () => {
    const f = fichasRestos([row('SINTA', 0.3, [['a', 1]], 366), row('SINTB', 0.3, [['a', 1]], 365), row('SINTC', 0.3, [['a', 1]], null)], now)
    expect(Object.fromEntries(f.map(x => [x.asset, x.viejo]))).toEqual({ SINTA: true, SINTB: false, SINTC: false })
  })
})

describe('valorResto', () => {
  it('nunca muestra «0,00 €» ni «-0,00 €»', () => {
    expect(valorResto(0.004, 'EUR')).toMatch(/^< 0,01\s€$/)
    expect(valorResto(0, 'EUR')).toBe('Sin precio')
    expect(valorResto(-0, 'EUR')).toBe('Sin precio')
    expect(valorResto(0.5, 'EUR')).toMatch(/^0,50\s€$/)
    for (const v of [0, -0, 1e-12, 0.001, 0.0049]) expect(valorResto(v, 'EUR')).not.toMatch(/0,00/)
  })
})

describe('repartirRecibido', () => {
  it('proporcional al valor y la suma es exactamente el total', () => {
    const p = repartirRecibido([{ key: 'a', value: 1 }, { key: 'b', value: 2 }, { key: 'c', value: 0 }], 0.0003)
    expect(p).toEqual({ a: 0.0001, b: 0.0002, c: 0 })
    const q = repartirRecibido([{ key: 'a', value: 1 }, { key: 'b', value: 1 }, { key: 'c', value: 1 }], 1)
    expect(descuadre(Object.values(q), 1)).toBe(0)
  })
  it('sin valor en ninguno, a partes iguales; sin total, nada', () => {
    expect(repartirRecibido([{ key: 'a', value: 0 }, { key: 'b', value: 0 }], 2)).toEqual({ a: 1, b: 1 })
    expect(repartirRecibido([{ key: 'a', value: 1 }], 0)).toEqual({})
  })
  it('descuadre: cuánto se pasa o falta lo repartido', () => {
    expect(descuadre([0.1, 0.2], 0.3)).toBe(0)
    expect(descuadre([0.1, 0.25], 0.3)).toBeCloseTo(0.05, 9)
  })
})
