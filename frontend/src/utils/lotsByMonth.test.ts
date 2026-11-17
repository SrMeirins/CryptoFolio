import { describe, expect, it } from 'vitest'
import { lotsByMonth, monthKey } from './lotsByMonth'
import type { LotView } from './portfolioLots'

// Lotes por mes de compra del panel de detalle (#528). Datos sintéticos.
const lot = (openedAt: string, quantity: number, cost: number, pnl: number | null, next = false): LotView => ({
  lotId: openedAt, lotIds: [openedAt], trozos: 1, walletId: 'w', walletName: 'W', walletColor: '#123456', openedAt, quantity, quantityOriginal: quantity,
  partial: false, unitCost: cost / quantity, cost, value: pnl === null ? 0 : cost + pnl, pnl, pnlPct: null, ageDays: 1,
  next, source: 'BUY', sourceWalletName: null, sourceWalletColor: null,
})

describe('lotsByMonth', () => {
  it('agrupa por mes en el orden FIFO y suma cantidad, coste y resultado', () => {
    const g = lotsByMonth([
      lot('2024-01-03T10:00:00Z', 10, 100, 20, true),
      lot('2024-01-20T10:00:00Z', 5, 50, -10),
      lot('2024-03-02T10:00:00Z', 1, 10, 5),
    ])
    expect(g.map(x => [x.key, x.lots.length, x.quantity, x.cost, x.pnl, x.next])).toEqual([
      ['2024-01', 2, 15, 150, 10, true],
      ['2024-03', 1, 1, 10, 5, false],
    ])
    expect(g[0].pnlPct).toBeCloseTo(6.667, 2)
    expect(g[0].label).toMatch(/^Enero de 2024$/)
  })
  it('sin precio en algún lote, el resultado del grupo es desconocido', () => {
    expect(lotsByMonth([lot('2024-01-03T10:00:00Z', 1, 1, 1), lot('2024-01-04T10:00:00Z', 1, 1, null)])[0]).toMatchObject({ pnl: null, pnlPct: null })
  })
  it('la clave de mes sigue la zona horaria de la aplicación (Europe/Madrid por defecto)', () => {
    expect(monthKey('2024-01-31T23:30:00Z')).toBe('2024-02')
  })
})
