import { describe, expect, it } from 'vitest'
import { distintivos, enlaceCelda, escalaImpacto, referenciasHoy, resumenMovimiento, textoContadores, vecinoEnDireccion } from './variacionMapa'
import type { HeatCell } from './topMovers'

// Datos sintéticos.
const celda = (asset: string, pct: number, members: string[] = []): HeatCell => ({ asset, pct, value: 10, impact: 0, price: 1, members })

describe('referenciasHoy (#513)', () => {
  const closes = {
    AAA: [{ date: '2026-11-17', price: 1 }, { date: '2026-11-18', price: 2 }],
    BBB: [{ date: '2026-11-17', price: 5 }],
    USDT: [{ date: '2026-11-18', price: 0.8 }],
  }
  it('el cierre de ayer de cada activo; sin cierre de ayer, sin referencia', () => {
    expect(referenciasHoy(closes, '2026-11-18', 'EUR')).toEqual({ AAA: 2, USDT: 0.8 })
  })
  it('en USD, dividido por el USDT del mismo día; sin USDT, ninguna', () => {
    expect(referenciasHoy(closes, '2026-11-18', 'USD')).toEqual({ AAA: 2.5, USDT: 1 })
    expect(referenciasHoy(closes, '2026-11-17', 'USD')).toEqual({})
    expect(referenciasHoy(undefined, '2026-11-18', 'EUR')).toEqual({})
  })
})

describe('resumenMovimiento', () => {
  const items = [{ impact: 30 }, { impact: 10 }, { impact: -5 }, { impact: -15 }]
  it('suben, bajan y neto de los activos', () => {
    expect(resumenMovimiento(items, null)).toEqual({ suben: 40, bajan: -20, otros: null, neto: 20 })
  })
  it('en Hoy, el neto es el P&L del día y «otros» lo que no explica el precio', () => {
    expect(resumenMovimiento(items, 168)).toEqual({ suben: 40, bajan: -20, otros: 148, neto: 168 })
    expect(resumenMovimiento([], -3)).toEqual({ suben: 0, bajan: 0, otros: -3, neto: -3 })
  })
})

describe('escalaImpacto', () => {
  it('el mayor |impacto| ocupa toda la barra', () => {
    const e = escalaImpacto([{ asset: 'A', impact: 30 }, { asset: 'B', impact: -60 }, { asset: 'C', impact: 0 }])
    expect([e.get('A'), e.get('B'), e.get('C')]).toEqual([0.5, 1, 0])
  })
})

describe('vecinoEnDireccion', () => {
  // Dos columnas: A grande a la izquierda; B arriba a la derecha, C y D abajo a la derecha.
  const rects = [
    { x: 0, y: 0, w: 50, h: 100 },
    { x: 50, y: 0, w: 50, h: 50 },
    { x: 50, y: 50, w: 25, h: 50 },
    { x: 75, y: 50, w: 25, h: 50 },
  ]
  it('las flechas van a la casilla más cercana y alineada en esa dirección', () => {
    expect(vecinoEnDireccion(rects, 0, 'ArrowRight')).toBe(1)
    expect(vecinoEnDireccion(rects, 1, 'ArrowDown')).toBe(2)
    expect(vecinoEnDireccion(rects, 2, 'ArrowRight')).toBe(3)
    expect(vecinoEnDireccion(rects, 3, 'ArrowUp')).toBe(1)
    expect(vecinoEnDireccion(rects, 2, 'ArrowLeft')).toBe(0)
  })
  it('sin casilla en esa dirección, null; Inicio y Fin a los extremos', () => {
    expect(vecinoEnDireccion(rects, 0, 'ArrowLeft')).toBeNull()
    expect(vecinoEnDireccion(rects, 1, 'ArrowUp')).toBeNull()
    expect(vecinoEnDireccion(rects, 2, 'Home')).toBe(0)
    expect(vecinoEnDireccion(rects, 0, 'End')).toBe(3)
    expect(vecinoEnDireccion(rects, 0, 'Enter')).toBeNull()
  })
})

describe('enlaceCelda', () => {
  it('un activo a su detalle; «Otros» al filtro con sus activos', () => {
    expect(enlaceCelda(celda('BTC', 1))).toBe('/portfolio?activo=BTC')
    expect(enlaceCelda(celda('Otros', 1, ['AAA', 'B&B']))).toBe('/portfolio?activos=AAA,B%26B')
  })
})

describe('distintivos', () => {
  it('mejor si sube, peor si baja; «Otros» no cuenta', () => {
    expect(distintivos([celda('A', 3), celda('B', -2), celda('Otros', 9, ['X', 'Y']), celda('C', -5)])).toEqual({ mejor: 0, peor: 3 })
    expect(distintivos([celda('A', -1), celda('B', -2)])).toEqual({ mejor: null, peor: 1 })
  })
})

describe('textoContadores', () => {
  it('recuentos en 24 h y en Total; todos en un sentido en una sola frase', () => {
    expect(textoContadores(7, 3, '24h')).toEqual({ up: '7 suben', down: '3 bajan' })
    expect(textoContadores(1, 1, '24h')).toEqual({ up: '1 sube', down: '1 baja' })
    expect(textoContadores(4, 2, 'total')).toEqual({ up: '4 en ganancia', down: '2 en pérdida' })
    expect(textoContadores(0, 5, '24h')).toEqual({ up: 'Todos bajan (5)', down: null })
    expect(textoContadores(6, 0, 'total')).toEqual({ up: 'Todos en ganancia (6)', down: null })
    expect(textoContadores(2, 1, 'hoy')).toEqual({ up: '2 suben', down: '1 baja' })
  })
})
