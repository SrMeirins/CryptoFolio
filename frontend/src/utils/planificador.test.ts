import { describe, expect, it } from 'vitest'
import { mejorGananciaHasta, mejorPerdida, sugerencias, type PlanLot } from './planificador'

// Planificador de fin de año (#307). Datos sintéticos.
const lot = (asset: string, quantity: number, unitCost: number, walletId = 'w1', openedAt = '2024-01-01T00:00:00Z'): PlanLot =>
  ({ asset, walletId, walletName: `W ${walletId}`, walletColor: '#123456', walletKind: 'exchange', openedAt, quantity, unitCost })

describe('mejorPerdida (FIFO)', () => {
  it('vende solo los lotes antiguos con pérdida si los nuevos tienen ganancia', () => {
    // A 1 €: el 1.º pierde 100, el 2.º gana 25 → mejor vender solo el 1.º.
    expect(mejorPerdida([lot('X', 100, 2), lot('X', 50, 0.5)], 1)).toEqual({ quantity: 100, pnl: -100 })
  })
  it('respeta el orden: una pérdida en un lote nuevo exige vender antes los antiguos', () => {
    // 1.º gana 10, 2.º pierde 50 → vender ambos: −40.
    expect(mejorPerdida([lot('X', 10, 0), lot('X', 50, 2)], 1)).toEqual({ quantity: 60, pnl: -40 })
  })
  it('sin pérdida posible: null', () => {
    expect(mejorPerdida([lot('X', 10, 0.5)], 1)).toBeNull()
  })
})

describe('mejorGananciaHasta', () => {
  it('corta dentro del lote para llegar justo al tope', () => {
    const v = mejorGananciaHasta([lot('X', 100, 1)], 2, 30)
    expect(v?.pnl).toBeCloseTo(30, 9)
    expect(v?.quantity).toBeCloseTo(30, 9)
  })
  it('vende todo si la ganancia total cabe', () => {
    expect(mejorGananciaHasta([lot('X', 10, 1)], 2, 30)).toEqual({ quantity: 10, pnl: 10 })
  })
  it('sin colchón no sugiere nada', () => {
    expect(mejorGananciaHasta([lot('X', 10, 1)], 2, 0)).toBeNull()
  })
})

describe('sugerencias', () => {
  it('por activo con FIFO global, recompras al final y sin precio fuera', () => {
    // B: el lote más antiguo (5 a 1 €, en w2) sale primero aunque se venda desde w1,
    // la wallet con más cantidad; vendiendo lo de w1 (10) salen 5 de w2 y 5 de w1.
    const s = sugerencias(
      [lot('A', 10, 5), lot('B', 5, 1, 'w2', '2023-01-01T00:00:00Z'), lot('B', 10, 3), lot('C', 1, 1)],
      { A: 1, B: 1, NOPRICE: 0 },
      100,
      { A: '2026-10-01T00:00:00Z' },
    )
    expect(s.perdidas.map(p => `${p.asset}/${p.walletId}:${p.quantity}/${p.disponible}:${p.pnl}:${p.recompra}`))
      .toEqual(['B/w1:10/10:-10:false', 'A/w1:10/10:-40:true'])
    expect(s.ganancias).toEqual([])
  })

  it('una sola sugerencia por activo aunque esté en varias wallets', () => {
    const s = sugerencias([lot('A', 2, 5, 'w1'), lot('A', 3, 5, 'w2')], { A: 1 }, 0, {})
    expect(s.perdidas).toHaveLength(1)
    expect(s.perdidas[0].walletId).toBe('w2')
    expect(s.perdidas[0].quantity).toBe(3)
  })
})
