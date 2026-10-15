import { describe, expect, it } from 'vitest'
import { cellTier, squarify, withMinShare } from './squarify'

// Mapa de árbol del mapa de calor (#233).
const area = (r: { w: number; h: number }) => r.w * r.h

describe('squarify', () => {
  it('cada celda tiene un área proporcional a su valor y todas llenan el contenedor', () => {
    const values = [40, 18, 15, 7, 7, 4, 4, 3, 2]
    const rects = squarify(values, 1000, 400)
    const total = values.reduce((s, v) => s + v, 0)
    rects.forEach((r, i) => expect(area(r)).toBeCloseTo((values[i] / total) * 10_000, 6))
    expect(rects.reduce((s, r) => s + area(r), 0)).toBeCloseTo(10_000, 6)
  })

  it('las celdas no se salen del contenedor ni se solapan', () => {
    const rects = squarify([5, 4, 3, 2, 1, 1], 800, 300)
    for (const r of rects) {
      expect(r.x).toBeGreaterThanOrEqual(-1e-9)
      expect(r.y).toBeGreaterThanOrEqual(-1e-9)
      expect(r.x + r.w).toBeLessThanOrEqual(100 + 1e-9)
      expect(r.y + r.h).toBeLessThanOrEqual(100 + 1e-9)
    }
    for (let a = 0; a < rects.length; a++) for (let b = a + 1; b < rects.length; b++) {
      const A = rects[a], B = rects[b]
      const overlapX = Math.min(A.x + A.w, B.x + B.w) - Math.max(A.x, B.x)
      const overlapY = Math.min(A.y + A.h, B.y + B.h) - Math.max(A.y, B.y)
      expect(overlapX <= 1e-9 || overlapY <= 1e-9).toBe(true)
    }
  })

  it('procura celdas cuadradas: proporción razonable con valores parecidos', () => {
    const rects = squarify([1, 1, 1, 1], 400, 400)
    for (const r of rects) expect(Math.max(r.w / r.h, r.h / r.w)).toBeLessThanOrEqual(2.0001)
  })

  it('casos límite: un solo valor ocupa todo; sin total, celdas vacías', () => {
    expect(squarify([7], 1000, 400)).toEqual([{ x: 0, y: 0, w: 100, h: 100 }])
    expect(squarify([0, 0], 100, 100)).toEqual([{ x: 0, y: 0, w: 0, h: 0 }, { x: 0, y: 0, w: 0, h: 0 }])
    expect(squarify([], 100, 100)).toEqual([])
  })
})

describe('withMinShare', () => {
  it('ninguna celda baja del mínimo; el total se conserva y el orden de las grandes también', () => {
    const v = [3600, 1640, 1340, 670, 620, 340, 340, 280, 168]
    const adj = withMinShare(v, 0.04)
    const total = v.reduce((s, x) => s + x, 0)
    expect(adj.reduce((s, x) => s + x, 0)).toBeCloseTo(total, 6)
    adj.forEach(x => expect(x / total).toBeGreaterThanOrEqual(0.04 - 1e-9))
    expect(adj[0]).toBeGreaterThan(adj[1])
    expect(adj[1]).toBeGreaterThan(adj[2])
  })
  it('si todas superan el mínimo no cambia nada; con muchas celdas el mínimo se reparte a partes iguales', () => {
    expect(withMinShare([50, 30, 20], 0.04)).toEqual([50, 30, 20])
    const many = withMinShare(Array.from({ length: 50 }, (_, i) => i === 0 ? 1000 : 1), 0.04)
    many.slice(1).forEach(x => expect(x).toBeCloseTo(many[1], 9))
  })
  it('sin valores o sin total: ceros', () => {
    expect(withMinShare([], 0.04)).toEqual([])
    expect(withMinShare([0, 0], 0.04)).toEqual([0, 0])
  })
})

describe('cellTier', () => {
  it('más detalle cuanto más grande; la más pequeña conserva las siglas', () => {
    expect(cellTier(400, 200)).toBe('xl')
    expect(cellTier(120, 80)).toBe('lg')
    expect(cellTier(70, 50)).toBe('md')
    expect(cellTier(30, 20)).toBe('sm')
  })
})
