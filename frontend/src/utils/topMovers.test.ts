import { describe, expect, it } from 'vitest'
import { rankMovers } from './topMovers'
import type { AssetValuation } from './portfolioValuation'

// Activo cripto con valor = cantidad × precio y coste dado.
function crypto(asset: string, quantity: number, price: number | null, cost: number): AssetValuation {
  return { asset, kind: 'crypto', quantity, cost, price, value: price === null ? 0 : quantity * price }
}

const names = (items: { asset: string }[]) => items.map(i => i.asset)

describe('rankMovers — modo total (rentabilidad desde la compra)', () => {
  const assets = [
    crypto('A', 10, 20, 100),  // +100 %
    crypto('B', 10, 15, 100),  // +50 %
    crypto('C', 10, 11, 100),  // +10 %
    crypto('D', 10, 9, 100),   // −10 %
    crypto('E', 10, 6, 100),   // −40 %
    crypto('F', 10, 3, 100),   // −70 %
  ]

  it('ordena por rentabilidad y calcula el % frente al precio medio', () => {
    const { top, bottom } = rankMovers(assets, {}, 'total')
    expect(names(top)).toEqual(['A', 'B', 'C'])
    expect(names(bottom)).toEqual(['F', 'E', 'D'])
    expect(top[0].pct).toBeCloseTo(100, 10)
    expect(bottom[0].pct).toBeCloseTo(-70, 10)
    expect(top.map(i => i.rank)).toEqual([1, 2, 3])
  })
})

describe('rankMovers — modo 24h', () => {
  it('usa el precio de hace 24h y excluye los activos sin él', () => {
    const assets = [crypto('A', 10, 11, 1), crypto('B', 10, 9, 1), crypto('NFT', 10, 5, 1)]
    const { top, bottom } = rankMovers(assets, { A: 10, B: 10 }, '24h')
    expect(names(top)).toEqual(['A'])
    expect(names(bottom)).toEqual(['B'])
    expect(top[0].pct).toBeCloseTo(10, 10)
    expect(bottom[0].pct).toBeCloseTo(-10, 10)
  })
})

describe('rankMovers — filtros y reparto', () => {
  it('excluye los activos con valor inferior a 1 € (polvo)', () => {
    const assets = [crypto('XRP', 100, 2, 100), crypto('BNB', 0.0002, 600, 0.05), crypto('LUNC', 10, 0.00005, 1)]
    const { top, bottom } = rankMovers(assets, {}, 'total')
    expect([...names(top), ...names(bottom)]).toEqual(['XRP'])
  })

  it('excluye activos sin precio actual o sin coste', () => {
    const assets = [crypto('XRP', 100, 2, 100), crypto('SINPRECIO', 10, null, 50), crypto('REGALO', 10, 5, 0)]
    const { top, bottom } = rankMovers(assets, {}, 'total')
    expect([...names(top), ...names(bottom)]).toEqual(['XRP'])
  })

  it('con menos de seis activos ningún activo aparece en las dos listas', () => {
    const assets = [
      crypto('A', 10, 20, 100), crypto('B', 10, 15, 100),
      crypto('C', 10, 9, 100), crypto('D', 10, 6, 100),
    ]
    const { top, bottom } = rankMovers(assets, {}, 'total')
    expect(names(top)).toEqual(['A', 'B'])
    expect(names(bottom)).toEqual(['D', 'C'])
  })

  it('con un número impar de activos, el sobrante va a Mejores', () => {
    const assets = [crypto('A', 10, 20, 100), crypto('B', 10, 15, 100), crypto('C', 10, 9, 100)]
    const { top, bottom } = rankMovers(assets, {}, 'total')
    expect(names(top)).toEqual(['A', 'B'])
    expect(names(bottom)).toEqual(['C'])
  })

  it('sin activos válidos devuelve listas vacías', () => {
    expect(rankMovers([], {}, '24h')).toEqual({ top: [], bottom: [] })
  })

  it('ignora el saldo fiat', () => {
    const assets: AssetValuation[] = [
      { asset: 'EUR', kind: 'fiat', quantity: 500, cost: 500, price: 1, value: 500 },
      crypto('XRP', 100, 2, 100),
    ]
    expect(names(rankMovers(assets, {}, 'total').top)).toEqual(['XRP'])
  })
})
