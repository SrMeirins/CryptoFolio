import { describe, expect, it } from 'vitest'
import { rankMovers, heatVars } from './topMovers'
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

describe('rankMovers — umbral de polvo en la moneda de visualización (#177)', () => {
  it('aplica el umbral recibido en lugar de 1', () => {
    const assets = [crypto('A', 1, 1.1, 1), crypto('B', 1, 2, 1)]
    // En USD con 1 € = 1,2 $, un activo de 1,10 $ (< 1 €) es polvo.
    expect(names(rankMovers(assets, {}, 'total', 1.2).top)).toEqual(['B'])
    expect(names(rankMovers(assets, {}, 'total').top)).toEqual(['B'])
    expect(rankMovers(assets, {}, 'total').bottom.map(i => i.asset)).toEqual(['A'])
  })
})

// ── Mapa de calor y ranking (#233) ──
import { heatBackground, heatLevel, heatmapCells, moverData, moversSummary, rankLabels, type MoverData } from './topMovers'

const mover = (asset: string, pct: number, value: number, impact = 0): MoverData =>
  ({ asset, pct, value, price: 1, reference: 1, impact })

describe('moverData (#233)', () => {
  it('incluye precio, referencia e impacto en la cartera (cantidad × variación de precio)', () => {
    const assets = [{ asset: 'BTC', kind: 'crypto', quantity: 2, cost: 100, price: 60, value: 120 }] as const
    const [btc] = moverData(assets as never, { BTC: 50 }, '24h')
    expect(btc).toMatchObject({ asset: 'BTC', price: 60, reference: 50, impact: 20, value: 120 })
    expect(btc.pct).toBeCloseTo(20, 9)
    expect(moverData(assets as never, {}, 'total')[0]).toMatchObject({ reference: 50, impact: 20 })
  })
})

describe('rankLabels (#233)', () => {
  it('cada columna se titula por lo que contiene', () => {
    const items = [mover('A', 2, 1), mover('B', -1, 1), mover('C', -3, 1)]
    expect(rankLabels(items, [items[0]], [items[2]])).toEqual({ first: 'Suben más', second: 'Bajan más', notice: null })
    // Solo uno sube y la primera columna incluye uno que baja: «Mejor evolución».
    expect(rankLabels(items, [items[0], items[1]], [items[2]]).first).toBe('Mejor evolución')
    expect(rankLabels(items, [items[0]], [items[0], items[2]]).second).toBe('Peor evolución')
  })
  it('todo baja: «Caen menos» y aviso; todo sube: «Suben menos» y aviso', () => {
    expect(rankLabels([mover('A', -2, 1), mover('B', -1, 1)])).toEqual({ first: 'Caen menos', second: 'Bajan más', notice: 'Mercado en rojo: 2 de 2 activos bajan' })
    expect(rankLabels([mover('A', 2, 1)])).toEqual({ first: 'Suben más', second: 'Suben menos', notice: 'Mercado en verde: 1 de 1 activos suben' })
  })
})

describe('heatmapCells (#233)', () => {
  it('de mayor a menor valor y agrupa en «Otros» los de menos del 1 %, con % ponderado', () => {
    const cells = heatmapCells([mover('A', 1, 900), mover('B', -2, 95, -2), mover('C', 4, 3, 0.1), mover('D', -8, 2, -0.2)])
    expect(cells.map(c => c.asset)).toEqual(['A', 'B', 'Otros'])
    expect(cells[2].members).toEqual(['C', 'D'])
    expect(cells[2].value).toBe(5)
    expect(cells[2].pct).toBeCloseTo((4 * 3 - 8 * 2) / 5, 9)
    expect(cells[2].impact).toBeCloseTo(-0.1, 9)
  })
  it('un único activo pequeño no se agrupa; sin valor, sin celdas', () => {
    expect(heatmapCells([mover('A', 1, 999), mover('B', 1, 1)]).map(c => c.asset)).toEqual(['A', 'B'])
    expect(heatmapCells([])).toEqual([])
  })
})

describe('heatAlpha y moversSummary (#233)', () => {
  it('intensidad continua con curva de raíz hasta el tope y saturada después', () => {
    expect(heatLevel(0, 5)).toBe(0)
    expect(heatLevel(5, 5)).toBe(1)
    expect(heatLevel(-40, 5)).toBe(1)
    expect(heatLevel(1.25, 5)).toBeCloseTo(0.56, 9)       // 0,12 + 0,88 × √0,25
    expect(heatLevel(0.5, 5)).toBeGreaterThan(0.3)        // un 0,5 % ya se distingue del gris
  })
  it('fondo: mezcla del tono del tema con el gris neutro', () => {
    expect(heatBackground(-5, 5)).toBe('color-mix(in srgb, var(--cf-heat-down) calc(1.000 * var(--cf-heat-max) * 1%), var(--cf-bg-tertiary))')
    expect(heatBackground(0, 5)).toContain('var(--cf-heat-up) calc(0.000')
  })
  it('posiciones en ganancia y pérdida, mejor y peor', () => {
    const s = moversSummary([mover('A', 30, 1), mover('B', 5, 1), mover('C', -20, 1)])
    expect(s).toMatchObject({ gains: 2, losses: 1 })
    expect(s.best?.asset).toBe('A')
    expect(s.worst?.asset).toBe('C')
    expect(moversSummary([mover('A', -1, 1)]).best).toBeNull()
  })
})

describe('heatVars (#412)', () => {
  it('color del signo y nivel de la escala para el marco del calendario', () => {
    expect(heatVars(100, 100)).toEqual({ '--card': 'var(--cf-positive)', '--heat': '1.000' })
    expect(heatVars(-25, 100)).toEqual({ '--card': 'var(--cf-negative)', '--heat': '0.560' })
    expect(heatVars(0, 100)).toEqual({ '--card': 'var(--cf-fg-subtle)', '--heat': '0.000' })
  })

  it('más intensidad cuanto mayor el importe', () => {
    expect(Number(heatVars(10, 100)['--heat'])).toBeLessThan(Number(heatVars(50, 100)['--heat']))
  })
})
