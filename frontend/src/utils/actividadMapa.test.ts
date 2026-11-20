import { describe, expect, it } from 'vitest'
import type { ByCategory } from '../api/portfolio'
import { desglose, diaSemana, dominante, moverDia, nivel, semanasMapa } from './actividadMapa'

// Datos sintéticos.
const cat = (p: Partial<ByCategory> = {}): ByCategory => ({ compras: 0, ventas: 0, otras_salidas: 0, ingresos: 0, transferencias: 0, otros: 0, ...p })

describe('dominante (#516)', () => {
  it('el tipo con más operaciones; a igualdad, el de más valor', () => {
    expect(dominante(cat({ compras: 3, ingresos: 1 }), cat({ compras: 10, ingresos: 99 }))).toBe('compras')
    expect(dominante(cat({ compras: 2, ventas: 2 }), cat({ compras: 10, ventas: 50 }))).toBe('ventas')
    expect(dominante(cat(), cat())).toBeNull()
  })
})

describe('semanasMapa', () => {
  // Jueves 19 de noviembre de 2026.
  const hoy = '2026-11-19'
  it('26 semanas de lunes a domingo terminando en la de hoy; lo futuro, null', () => {
    const s = semanasMapa([], hoy)
    expect(s).toHaveLength(26)
    expect(s[25][0]?.day).toBe('2026-11-16')
    expect(s[25][3]?.day).toBe(hoy)
    expect(s[25][4]).toBeNull()
    expect(s[0][0]?.day).toBe('2026-05-25')
    expect(diaSemana(s[0][0]!.day)).toBe(0)
  })
  it('cada día con su total y su tipo dominante', () => {
    const s = semanasMapa([{ periodo: '2026-11-17', ops: cat({ compras: 2, ingresos: 1 }), valor: { EUR: cat() } }], hoy)
    expect(s[25][1]).toMatchObject({ day: '2026-11-17', total: 3, dominante: 'compras' })
    expect(s[25][2]).toMatchObject({ total: 0, dominante: null })
  })
})

describe('nivel, desglose y moverDia', () => {
  it('intensidad por cuartos del día con más operaciones', () => {
    expect([nivel(0, 8), nivel(1, 8), nivel(3, 8), nivel(5, 8), nivel(8, 8)]).toEqual([0, 1, 2, 3, 4])
  })
  it('desglose ordenado y legible', () => {
    expect(desglose(cat({ compras: 3, ingresos: 1 }))).toBe('3 compras y 1 ingreso')
    expect(desglose(cat({ ventas: 1, transferencias: 2, compras: 1 }))).toBe('2 movimientos, 1 compra y 1 venta')
    expect(desglose(null)).toBe('sin operaciones')
  })
  it('flechas: día a día en vertical, semana a semana en horizontal; sin salir del rango', () => {
    expect(moverDia('2026-11-10', 'ArrowDown', '2026-05-25', '2026-11-19')).toBe('2026-11-11')
    expect(moverDia('2026-11-10', 'ArrowRight', '2026-05-25', '2026-11-19')).toBe('2026-11-17')
    expect(moverDia('2026-11-17', 'ArrowRight', '2026-05-25', '2026-11-19')).toBeNull()
    expect(moverDia('2026-11-10', 'Home', '2026-05-25', '2026-11-19')).toBe('2026-05-25')
    expect(moverDia('2026-11-10', 'Enter', '2026-05-25', '2026-11-19')).toBeNull()
  })
})
