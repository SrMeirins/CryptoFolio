import { describe, expect, it } from 'vitest'
import type { RendimientoEvent } from '../pages/fiscal/types'
import { claveDe, conservadaDe, estadoCorto, mesesConDatos, porMes, resumenPorTipo, serieMensual } from './rendimientos'

// Rendimientos de Fiscal (#544). Datos sintéticos.
const r = (p: Partial<RendimientoEvent>): RendimientoEvent => ({
  fecha: '2025-03-10', tipo: 'Staking', activo: 'ABC', cantidad: 1, valorEur: 10, wallet: 'W', base: 'ahorro', operacion: 'STAKING_REWARD', ...p,
})

describe('claveDe', () => {
  it('por la operación y, sin ella, por la etiqueta', () => {
    expect(claveDe(r({ operacion: 'LENDING_INTEREST_LOCKED' }))).toBe('intereses')
    expect(claveDe(r({ operacion: 'AIRDROP' }))).toBe('airdrop')
    expect(claveDe(r({ operacion: undefined, tipo: 'Cashback / Bonus' }))).toBe('cashback')
    expect(claveDe(r({ operacion: undefined, tipo: 'Minería' }))).toBe('mineria')
  })
})

describe('resumenPorTipo y serieMensual', () => {
  const rends = [
    r({ valorEur: 10 }), r({ fecha: '2025-03-20', valorEur: 5 }),
    r({ fecha: '2025-07-01', operacion: 'CASHBACK', tipo: 'Cashback', valorEur: 2, base: 'general' }),
  ]
  it('total y número por tipo, en el orden fijo y solo los presentes', () => {
    expect(resumenPorTipo(rends)).toEqual([
      { clave: 'staking', label: 'Staking', total: 15, n: 2 },
      { clave: 'cashback', label: 'Cashback', total: 2, n: 1 },
    ])
  })
  it('12 meses con el valor de cada tipo; la suma cuadra con el total', () => {
    const s = serieMensual(rends)
    expect(s).toHaveLength(12)
    expect(s[2]).toMatchObject({ mes: 3, label: 'marzo', staking: 15, cashback: 0 })
    expect(s[6]).toMatchObject({ cashback: 2 })
    expect(s.reduce((t, f) => t + f.staking + f.intereses + f.mineria + f.airdrop + f.cashback, 0)).toBe(17)
  })
  it('meses con datos', () => {
    expect(mesesConDatos(rends)).toBe(2)
    expect(mesesConDatos([r({})])).toBe(1)
  })
})

describe('porMes', () => {
  it('agrupa por mes en orden, con subtotal y las filas por fecha', () => {
    const g = porMes([r({ fecha: '2025-05-02', valorEur: 1 }), r({ fecha: '2025-01-09', valorEur: 4 }), r({ fecha: '2025-01-03', valorEur: 6 })])
    expect(g.map(x => [x.mes, x.label, x.total, x.items.length])).toEqual([[1, 'enero', 10, 2], [5, 'mayo', 1, 1]])
    expect(g[0].items.map(x => x.fecha)).toEqual(['2025-01-03', '2025-01-09'])
  })
})

describe('estadoCorto', () => {
  const e = (conservada: number, transmitida: number, sinEfecto: number) => ({ cantidad: 10, conservada, transmitida, sinEfecto, resultadoEur: 0, anios: [] })
  it('según lo que conservas, salga como salga', () => {
    expect(estadoCorto(e(10, 0, 0))).toEqual({ texto: 'Conservadas', tono: 'conservadas' })
    expect(estadoCorto(e(6, 4, 0))).toEqual({ texto: 'Conservas el 60 %', tono: 'parte' })
    expect(estadoCorto(e(0, 10, 0))).toEqual({ texto: 'Ya no las tienes', tono: 'fuera' })
    // Devueltas en un préstamo de margen: no se transmiten, pero ya no están.
    expect(estadoCorto(e(0, 0, 10))).toEqual({ texto: 'Ya no las tienes', tono: 'fuera' })
    // Un resto mínimo no se redondea a 0 % ni a 100 %.
    expect(estadoCorto(e(0.001, 9.999, 0)).texto).toBe('Conservas el 1 %')
    expect(estadoCorto(null)).toEqual({ texto: 'Cobrado en euros', tono: 'sin_lote' })
  })
  it('conservadaDe: el dato o, sin él, lo recibido menos lo transmitido', () => {
    expect(conservadaDe({ cantidad: 10, conservada: 3, transmitida: 7, sinEfecto: 0, resultadoEur: 0, anios: [] })).toBe(3)
    const sinDato = { cantidad: 10, transmitida: 4 } as unknown as Parameters<typeof conservadaDe>[0]
    expect(conservadaDe(sinDato)).toBe(6)
  })
  it('nunca da un porcentaje inválido si falta el dato de lo que conservas', () => {
    const sinDato = { cantidad: 10, transmitida: 4, sinEfecto: 0, resultadoEur: 0, anios: [] } as unknown as Parameters<typeof estadoCorto>[0]
    expect(estadoCorto(sinDato).texto).toBe('Conservas el 60 %')
    const nada = { cantidad: 10 } as unknown as Parameters<typeof estadoCorto>[0]
    expect(estadoCorto(nada).texto).toBe('Conservadas')
  })
})
