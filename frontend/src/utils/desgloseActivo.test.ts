import { describe, expect, it } from 'vitest'
import { cascadaContribucion, escalaCascada, filasRanking, filtrarRanking, ordenarRanking, separarOtros, totalesRanking, tramoBarra } from './desgloseActivo'
import type { BreakdownItem } from '../pages/fiscal/types'

// Desglose por activo (#540). Datos sintéticos.
const it_ = (asset: string, g: number, p: number, ops = 1): BreakdownItem => ({ asset, ganancias: g, perdidas: p, neto: g + p, operaciones: ops })
const datos = [it_('AAA', 100, -20, 3), it_('BBB', 0, -50, 2), it_('CCC', 30, 0, 1)]

describe('filasRanking', () => {
  it('peso: parte del movimiento, suma 100 %', () => {
    const f = filasRanking(datos)
    expect(f.map(x => Math.round(x.peso))).toEqual([60, 25, 15])
    expect(f.reduce((t, x) => t + x.peso, 0)).toBeCloseTo(100, 9)
    expect(filasRanking([it_('X', 0, 0)])[0].peso).toBe(0)
  })
})

describe('ordenar y filtrar', () => {
  const f = filasRanking(datos)
  it('por cualquier columna, en los dos sentidos', () => {
    expect(ordenarRanking(f, 'neto', 'desc').map(x => x.asset)).toEqual(['AAA', 'CCC', 'BBB'])
    expect(ordenarRanking(f, 'operaciones', 'asc').map(x => x.asset)).toEqual(['CCC', 'BBB', 'AAA'])
    expect(ordenarRanking(f, 'asset', 'desc').map(x => x.asset)).toEqual(['CCC', 'BBB', 'AAA'])
  })
  it('por texto y por signo del neto', () => {
    expect(filtrarRanking(f, 'bb', 'todos').map(x => x.asset)).toEqual(['BBB'])
    expect(filtrarRanking(f, '', 'perdida').map(x => x.asset)).toEqual(['BBB'])
    expect(filtrarRanking(f, '', 'ganancia').map(x => x.asset)).toEqual(['AAA', 'CCC'])
  })
  it('totales de lo filtrado', () => {
    expect(totalesRanking(filtrarRanking(f, '', 'ganancia'))).toEqual({ neto: 110, operaciones: 4, activos: 2 })
  })
})

describe('separarOtros', () => {
  it('los 8 primeros y el resto; con 9 o menos no se agrupa (un «Otros» de uno no aporta)', () => {
    const n = (k: number) => Array.from({ length: k }, (_, i) => i)
    expect(separarOtros(n(12))).toEqual({ principales: n(8), otros: [8, 9, 10, 11] })
    expect(separarOtros(n(9)).otros).toEqual([])
  })
})

describe('cascadaContribucion', () => {
  it('primero lo que suma de mayor a menor, luego lo que resta, y termina exactamente en el neto', () => {
    const c = cascadaContribucion(datos)
    expect(c.pasos.map(p => p.label)).toEqual(['AAA', 'CCC', 'BBB', 'Neto del ejercicio'])
    expect(c.pasos[1]).toMatchObject({ desde: 80, hasta: 110 })
    expect(c.pasos[2]).toMatchObject({ desde: 110, hasta: 60 })
    expect(c.pasos.at(-1)).toMatchObject({ total: true, importe: 60, desde: 0, hasta: 60 })
    expect(c.pasos.at(-2)!.hasta).toBe(c.pasos.at(-1)!.importe)
  })
  it('agrupa en «Otros» lo que no entra entre los principales y sigue cuadrando con el neto', () => {
    const muchos = Array.from({ length: 12 }, (_, i) => it_(`A${i}`, i % 2 ? 0 : 10 + i, i % 2 ? -(5 + i) : 0))
    const c = cascadaContribucion(muchos)
    const otros = c.pasos.find(p => p.label === 'Otros')!
    expect(otros.agrupados).toBe(4)
    const neto = muchos.reduce((t, i) => t + i.neto, 0)
    expect(c.pasos.at(-1)!.importe).toBe(neto)
    expect(c.pasos.at(-2)!.hasta).toBeCloseTo(neto, 9)
    expect(c.min).toBeLessThanOrEqual(0)
  })
  it('sin activos: solo el neto a cero', () => {
    expect(cascadaContribucion([]).pasos).toEqual([{ clave: '__neto', label: 'Neto del ejercicio', importe: 0, desde: 0, hasta: 0, total: true }])
  })
})

describe('tramoBarra', () => {
  it('posición en la escala común, también con negativos', () => {
    expect(tramoBarra({ desde: 110, hasta: 60 }, 0, 110)).toEqual({ left: (60 / 110) * 100, width: (50 / 110) * 100 })
    expect(tramoBarra({ desde: 0, hasta: -50 }, -100, 100)).toEqual({ left: 25, width: 25 })
    expect(tramoBarra({ desde: 0, hasta: 0 }, 0, 0)).toEqual({ left: 0, width: 0 })
  })
})

describe('escalaCascada', () => {
  it('marcas redondas que cubren los datos e incluyen el cero', () => {
    expect(escalaCascada(-1052.89, 34)).toEqual({ min: -1200, max: 200, ticks: [-1200, -1000, -800, -600, -400, -200, 0, 200] })
    expect(escalaCascada(0, 110).ticks).toEqual([0, 20, 40, 60, 80, 100, 120])
  })
  it('sin recorrido: escala neutra', () => {
    expect(escalaCascada(0, 0)).toEqual({ min: 0, max: 1, ticks: [0, 1] })
  })
})
