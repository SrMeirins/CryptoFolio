import { describe, expect, it } from 'vitest'
import { baseTramosCompensada, calcularTramos, tramoActivo, TRAMOS_DEFAULT } from './tramosIrpf'
import type { CarryforwardDetalle } from '../pages/fiscal/types'

function cfYear(overrides: Partial<CarryforwardDetalle>): CarryforwardDetalle {
  return {
    year: 2025,
    netoAntes: 0,
    rendimientos: 0,
    perdida: 0,
    compensadoPatrim: 0,
    compensadoRend: 0,
    compensado: 0,
    limiteRend25: 0,
    netoDespues: 0,
    ...overrides,
  }
}

describe('baseTramosCompensada', () => {
  // Caso del hallazgo de auditoría: 10.000€ de pérdidas pendientes de años
  // anteriores absorben las 8.000€ de ganancias del año — la base tras
  // compensar debería ser 0€, no las 8.000€ brutas.
  it('usa la base YA compensada, no el neto bruto del año', () => {
    const year = cfYear({ netoAntes: 8000, netoDespues: 0, compensadoPatrim: 8000 })
    expect(baseTramosCompensada(year, 8000, 0)).toBe(0)
  })

  it('resta también la parte de rendimientos usada para compensar pérdidas (límite 25%)', () => {
    const year = cfYear({ rendimientos: 1000, compensadoRend: 250, netoDespues: 0 })
    // 1000 de rendimientos, 250 ya usados para compensar pérdidas → quedan 750
    expect(baseTramosCompensada(year, 0, 1000)).toBe(750)
  })

  it('sin pérdidas pendientes, la base compensada coincide con el neto bruto', () => {
    const year = cfYear({ netoAntes: 5000, netoDespues: 5000, rendimientos: 200, compensadoRend: 0 })
    expect(baseTramosCompensada(year, 5000, 200)).toBe(5200)
  })

  it('sin datos de carryforward para el año (fuera de la ventana de 5 años), usa el neto bruto', () => {
    expect(baseTramosCompensada(undefined, 3000, 500)).toBe(3500)
  })
})

describe('calcularTramos', () => {
  it('base cero o negativa no genera ningún tramo', () => {
    expect(calcularTramos(0)).toEqual([])
    expect(calcularTramos(-100)).toEqual([])
  })

  it('base dentro del primer tramo genera un único tramo', () => {
    const result = calcularTramos(5000)
    expect(result).toEqual([{ tramo: '0 – 6.000 €', tipo: 19, cuota: 950, base: 5000 }])
  })

  it('base que cruza dos tramos reparte la cuota proporcionalmente a cada uno', () => {
    const result = calcularTramos(10000)
    expect(result).toEqual([
      { tramo: '0 – 6.000 €',      tipo: 19, cuota: 1140, base: 6000 },
      { tramo: '6.001 – 50.000 €', tipo: 21, cuota: 840,  base: 4000 },
    ])
  })

  it('base que supera el último tramo (>300.000€) acumula los 5 tramos con la cuota total correcta', () => {
    const result = calcularTramos(400_000)
    expect(result).toHaveLength(5)
    const cuotaTotal = result.reduce((sum, t) => sum + t.cuota, 0)
    // 6000*0.19 + 44000*0.21 + 150000*0.23 + 100000*0.27 + 100000*0.30
    expect(cuotaTotal).toBe(1140 + 9240 + 34500 + 27000 + 30000)
    expect(result[4]).toEqual({ tramo: '> 300.000 €', tipo: 30, cuota: 30000, base: 100000 })
  })

  it('acepta tramos personalizados (override de Ajustes → Fiscal)', () => {
    const custom = [{ hasta: 1000, tipo: 10, label: 'custom' }]
    expect(calcularTramos(500, custom)).toEqual([{ tramo: 'custom', tipo: 10, cuota: 50, base: 500 }])
  })
})

describe('tramoActivo', () => {
  it('devuelve el tipo del primer tramo cuando la base está dentro de su límite', () => {
    expect(tramoActivo(5000)).toBe(19)
  })

  it('el límite superior de un tramo es inclusivo', () => {
    expect(tramoActivo(6000)).toBe(19)
    expect(tramoActivo(6001)).toBe(21)
  })

  it('una base que supera todos los tramos definidos devuelve el tipo del último', () => {
    expect(tramoActivo(1_000_000)).toBe(30)
  })

  it('usa TRAMOS_DEFAULT cuando no se pasan tramos personalizados', () => {
    expect(tramoActivo(400_000)).toBe(TRAMOS_DEFAULT[TRAMOS_DEFAULT.length - 1].tipo)
  })
})
