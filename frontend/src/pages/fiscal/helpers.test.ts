import { describe, expect, it } from 'vitest'
import { baseTramosCompensada } from './helpers'
import type { CarryforwardDetalle } from './types'

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
