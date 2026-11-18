import { describe, expect, it } from 'vitest'
import { reducirPuntos } from './reducirPuntos'

// Reducción de puntos para dibujar (#510).
describe('reducirPuntos', () => {
  const serie = Array.from({ length: 1000 }, (_, i) => ({ i, v: Math.sin(i / 20) * 100 + (i === 500 ? 1000 : 0), marca: i === 333 }))
  it('pocos puntos: sin cambios', () => {
    expect(reducirPuntos(serie.slice(0, 10), 100, p => p.v)).toHaveLength(10)
  })
  it('conserva primero, último, extremos y marcados, en orden y por debajo del máximo aproximado', () => {
    const r = reducirPuntos(serie, 200, p => p.v, p => p.marca)
    expect(r.length).toBeLessThanOrEqual(203)
    expect(r[0].i).toBe(0)
    expect(r.at(-1)!.i).toBe(999)
    expect(r.some(p => p.i === 500)).toBe(true)
    expect(r.some(p => p.i === 333)).toBe(true)
    expect(r.every((p, k) => k === 0 || p.i > r[k - 1].i)).toBe(true)
    expect(Math.max(...r.map(p => p.v))).toBe(Math.max(...serie.map(p => p.v)))
  })
  it('los nulos (sin dato) no cuentan como extremos', () => {
    const conNulos = Array.from({ length: 50 }, (_, i) => ({ i, v: i < 25 ? null : i }))
    const r = reducirPuntos(conNulos, 10, p => p.v)
    expect(r.at(-1)!.i).toBe(49)
  })
})
