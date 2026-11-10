import { describe, expect, it } from 'vitest'
import { filasComparativa, maxEscala, pctEscala, resumenComparativa } from './comparativaFiscal'
import type { YearOverview } from '../pages/fiscal/types'

// Comparativa interanual (#539). Datos sintéticos.
const ov = (year: number, g: number, p: number, cuota: number, ops: number, enCurso = false): YearOverview => ({
  year, esAnioEnCurso: enCurso, totalGanancias: g, totalPerdidas: p, netoPatrimonial: g + p, numOperaciones: ops,
  totalRendimientos: 0, base: Math.max(0, g + p), cuota,
})
const datos = [ov(2024, 500, -100, 76, 10), ov(2026, 50, -300, 0, 4, true), ov(2025, 200, -50, 28.5, 25)]

describe('filasComparativa', () => {
  it('del año más reciente al más antiguo, con las pérdidas en negativo', () => {
    const f = filasComparativa(datos, 'resultado')
    expect(f.map(x => x.year)).toEqual([2026, 2025, 2024])
    expect(f[0]).toMatchObject({ enCurso: true, perdidas: -300, neto: -250, valor: -250 })
  })
  it('el valor sigue a la métrica', () => {
    expect(filasComparativa(datos, 'cuota').map(x => x.valor)).toEqual([0, 28.5, 76])
    expect(filasComparativa(datos, 'operaciones').map(x => x.valor)).toEqual([4, 25, 10])
  })
})

describe('escala', () => {
  it('resultado: simétrica con el mayor de ganancias y pérdidas', () => {
    expect(maxEscala(filasComparativa(datos, 'resultado'), 'resultado')).toBe(500)
    expect(pctEscala(-300, 500)).toBe(60)
  })
  it('otras métricas: el mayor valor; nunca 0', () => {
    expect(maxEscala(filasComparativa(datos, 'operaciones'), 'operaciones')).toBe(25)
    expect(maxEscala(filasComparativa([ov(2025, 0, 0, 0, 0)], 'cuota'), 'cuota')).toBe(1)
  })
})

describe('resumenComparativa', () => {
  it('mejor, peor y media según la métrica', () => {
    const r = resumenComparativa(filasComparativa(datos, 'resultado'))!
    expect([r.mejor.year, r.peor.year]).toEqual([2024, 2026])
    expect(r.media).toBeCloseTo((400 + 150 - 250) / 3, 9)
    const o = resumenComparativa(filasComparativa(datos, 'operaciones'))!
    expect([o.mejor.year, o.peor.year]).toEqual([2025, 2026])
  })
  it('en empate, el año más reciente; sin años, nada', () => {
    const r = resumenComparativa(filasComparativa([ov(2024, 0, 0, 0, 3), ov(2025, 0, 0, 0, 3)], 'operaciones'))!
    expect(r.mejor.year).toBe(2025)
    expect(resumenComparativa([])).toBeNull()
  })
})
