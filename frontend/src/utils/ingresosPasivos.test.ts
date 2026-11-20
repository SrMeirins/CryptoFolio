import { describe, expect, it } from 'vitest'
import type { RendimientoEvent } from '../pages/fiscal/types'
import { desgloseIngresos, inicioDoceMeses, serieDoceMeses, totalesIngresos } from './ingresosPasivos'

// Datos sintéticos.
const r = (fecha: string, operacion: string, activo: string, wallet: string, valorEur: number): RendimientoEvent =>
  ({ fecha, tipo: operacion, operacion, activo, cantidad: 1, valorEur, wallet, base: 'ahorro' })

const HOY = '2026-11-20'
const rends = [
  r('2025-11-30', 'STAKING_REWARD', 'ADA', 'W1', 99),     // fuera: antes de diciembre de 2025
  r('2025-12-03', 'STAKING_REWARD', 'ADA', 'W1', 10),
  r('2026-01-15', 'LENDING_INTEREST', 'USDC', 'W2', 5),
  r('2026-11-02', 'STAKING_REWARD', 'DOT', 'W1', 2.5),
  r('2026-11-03', 'AIRDROP', 'XYZ', 'W2', 7.5),
]

describe('ingresos pasivos (#518)', () => {
  it('la ventana de 12 meses empieza el día 1 del mes de hace 11 meses', () => {
    expect(inicioDoceMeses(HOY)).toBe('2025-12-01')
    expect(inicioDoceMeses('2026-01-10')).toBe('2025-02-01')
  })
  it('totales del año en curso y de los últimos 12 meses', () => {
    expect(totalesIngresos(rends, HOY)).toEqual({ anio: 15, nAnio: 3, doceMeses: 25, nDoce: 4 })
  })
  it('serie de 12 meses por tipo, con los meses vacíos a 0', () => {
    const s = serieDoceMeses(rends, HOY)
    expect(s.map(f => f.ym)).toEqual(['2025-12', '2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11'])
    expect(s[0].porTipo.staking).toBe(10)
    expect(s[1].porTipo.intereses).toBe(5)
    expect(s[11]).toMatchObject({ total: 10, porTipo: { staking: 2.5, airdrop: 7.5 } })
    expect(s[5].total).toBe(0)
    expect(s[11].acumulado).toBe(25)
    expect(s[1].acumulado).toBe(15)
  })
  it('desglose por activo y por wallet, con «Otros» y la fracción del mayor', () => {
    const dentro = rends.slice(1)
    expect(desgloseIngresos(dentro, 'wallet')).toEqual([
      { clave: 'W1', total: 12.5, n: 2, fraccion: 1, parte: 0.5, porTipo: { staking: 12.5, intereses: 0, mineria: 0, airdrop: 0, cashback: 0 }, miembros: ['W1'] },
      { clave: 'W2', total: 12.5, n: 2, fraccion: 1, parte: 0.5, porTipo: { staking: 0, intereses: 5, mineria: 0, airdrop: 7.5, cashback: 0 }, miembros: ['W2'] },
    ])
    const otros = desgloseIngresos(dentro, 'activo', 2)
    expect(otros.map(f => f.clave)).toEqual(['ADA', 'XYZ', 'Otros'])
    expect(otros[2]).toMatchObject({ total: 7.5, n: 2, miembros: ['USDC', 'DOT'], porTipo: { intereses: 5, staking: 2.5 } })
  })
})
