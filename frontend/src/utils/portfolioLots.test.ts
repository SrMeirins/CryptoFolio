import { describe, expect, it } from 'vitest'
import type { OpenLot } from '../api/portfolio'
import { daysSince, formatAge, formatLotDate, lotDateDetail, lotOriginPrefix, lotSourceLabel, lotsView, unirTrozos } from './portfolioLots'

// Lotes FIFO del panel de detalle (#272).
const lot = (wallet: string, openedAt: string, original: number, remaining: number, unit: number, usdPerEur: string | null = null): OpenLot => ({
  lot_id: `lote-${wallet}`,
  wallet_id: wallet, wallet_name: `W ${wallet}`, wallet_color: '#123456', wallet_kind: 'exchange', opened_at: openedAt,
  quantity_original: String(original), quantity_remaining: String(remaining), price_per_unit_eur: String(unit),
  cost_basis_eur: String(remaining * unit), usd_per_eur: usdPerEur, source_type: 'BUY',
})
const now = new Date('2026-10-16T00:00:00Z')

describe('lotsView', () => {
  // En el orden FIFO global del backend (#476): el más antiguo primero, en cualquier wallet.
  const lots = [
    lot('spot', '2024-01-01T00:00:00Z', 50, 50, 1),
    lot('funding', '2024-02-01T00:00:00Z', 10, 10, 0.5),
    lot('spot', '2025-10-16T00:00:00Z', 100, 40, 3),
  ]

  it('P&L por lote al precio actual y solo el más antiguo como siguiente en venderse (FIFO global)', () => {
    const v = lotsView(lots, 2, 'EUR', null, now)
    expect(v.map(l => [l.walletId, l.next, l.pnl])).toEqual([['spot', true, 50], ['funding', false, 15], ['spot', false, -40]])
    expect(v[2].pnlPct).toBeCloseTo(-33.33, 2)
  })

  it('marca los lotes vendidos en parte y calcula la antigüedad', () => {
    const v = lotsView(lots, 2, 'EUR', null, now)
    expect(v.map(l => l.partial)).toEqual([false, false, true])
    expect(v[2].ageDays).toBe(365)
  })

  it('sin precio actual, sin P&L', () => {
    expect(lotsView(lots, 0, 'EUR', null, now)[0]).toMatchObject({ pnl: null, pnlPct: null })
  })

  it('en USD usa el tipo de apertura del lote y, si falta, el tipo en vivo', () => {
    const v = lotsView([lot('spot', '2024-01-01T00:00:00Z', 10, 10, 1, '1.10'), lot('spot', '2024-02-01T00:00:00Z', 10, 10, 1)], 2, 'USD', 1.2, now)
    expect(v[0].cost).toBeCloseTo(11, 9)
    expect(v[1].cost).toBeCloseTo(12, 9)
    expect(v[0].unitCost).toBeCloseTo(1.1, 9)
  })
})

describe('formatAge', () => {
  it('días con hoy y ayer', () => {
    expect(formatAge(0)).toBe('Hoy')
    expect(formatAge(1)).toBe('Ayer')
    expect(formatAge(30)).toBe('Hace 30 días')
  })
  it('meses y años con singular y plural', () => {
    expect(formatAge(31)).toBe('Hace 1 mes')
    expect(formatAge(150)).toBe('Hace 4 meses')
    expect(formatAge(364)).toBe('Hace 11 meses')
    expect(formatAge(365)).toBe('Hace 1 año')
    expect(formatAge(548)).toBe('Hace 1 año y 6 meses')
    expect(formatAge(800)).toBe('Hace 2 años y 2 meses')
    expect(formatAge(730)).toBe('Hace 2 años')
    expect(formatAge(400)).toBe('Hace 1 año y 1 mes')
  })
})

describe('fecha del lote', () => {
  it('año completo y sin punto en el mes', () => {
    expect(formatLotDate('2025-04-09T12:32:00Z')).toBe('9 abr 2025')
    expect(formatLotDate('2025-09-09T12:00:00Z')).toBe('9 sept 2025')
  })
  it('tooltip con hora de Madrid y días', () => {
    expect(lotDateDetail('2025-04-09T12:32:00Z', 554)).toBe('9 de abril de 2025, 14:32 · 554 días')
    expect(lotDateDetail('2025-04-09T12:32:00Z', 1)).toBe('9 de abril de 2025, 14:32 · 1 día')
  })
  it('las 23:30 UTC ya son el día siguiente en Madrid', () => {
    expect(formatLotDate('2025-12-31T23:30:00Z')).toBe('1 ene 2026')
  })
})

describe('origen de los traspasos (#528)', () => {
  it('lotsView lleva el id y la wallet de origen del lote', () => {
    const v = lotsView([{ ...lot('spot', '2024-01-01T00:00:00Z', 1, 1, 1), source_type: 'WITHDRAW', source_wallet_name: 'W origen', source_wallet_color: '#abcdef' }], 2, 'EUR', null, now)
    expect(v[0]).toMatchObject({ lotId: 'lote-spot', sourceWalletName: 'W origen', sourceWalletColor: '#abcdef' })
    expect(lotsView([lot('spot', '2024-01-01T00:00:00Z', 1, 1, 1)], 2, 'EUR', null, now)[0].sourceWalletName).toBeNull()
  })
  it('con la wallet de origen, el texto la nombra', () => {
    expect(lotSourceLabel('WITHDRAW', {}, 'W origen')).toBe('Traspaso desde W origen')
    expect(lotSourceLabel('REUBICACION', {}, 'W origen')).toBe('Reubicado desde W origen')
    expect(lotSourceLabel('BUY', { BUY: { label: 'Compra' } }, 'W origen')).toBe('Compra')
    expect(lotOriginPrefix('TRANSFER_INTERNAL')).toBe('Traspaso desde')
    expect(lotOriginPrefix('BUY')).toBeNull()
  })
})

describe('lotSourceLabel', () => {
  const labels = { BUY: { label: 'Compra' }, WITHDRAW: { label: 'Retirada' } }
  it('un lote reubicado por el FIFO global (#476) no se muestra como la venta que lo reubicó', () => {
    expect(lotSourceLabel('REUBICACION', labels)).toBe('Reubicado por el FIFO global')
  })
  it('los lotes llegados por transferencia se muestran como traspaso, no como retirada', () => {
    expect(lotSourceLabel('WITHDRAW', labels)).toBe('Traspaso desde otra wallet')
    expect(lotSourceLabel('TRANSFER_INTERNAL', labels)).toBe('Traspaso desde otra wallet')
  })
  it('el resto, con su etiqueta; sin etiqueta, el tipo tal cual', () => {
    expect(lotSourceLabel('BUY', labels)).toBe('Compra')
    expect(lotSourceLabel('NUEVO', labels)).toBe('NUEVO')
  })
})

describe('daysSince (#283)', () => {
  it('días completos, nunca negativos', () => {
    const now = new Date('2026-01-31T10:00:00Z')
    expect(daysSince(Date.parse('2026-01-01T10:00:00Z'), now)).toBe(30)
    expect(daysSince(Date.parse('2026-02-01T10:00:00Z'), now)).toBe(0)
    expect(daysSince(null, now)).toBeNull()
  })
})

describe('unirTrozos (#528)', () => {
  it('une los trozos de una misma compra (misma wallet, fecha y precio) y conserva el orden FIFO', () => {
    const base = lot('hw', '2026-06-01T18:08:12Z', 100, 100, 0.5)
    const trozo = { ...lot('hw', '2026-06-01T18:08:12Z', 0.2, 0.2, 0.5), lot_id: 'lote-trozo', source_type: 'WITHDRAW', source_wallet_name: 'W origen', source_wallet_color: '#abcdef' }
    const otro = lot('hw', '2026-07-01T00:00:00Z', 5, 5, 0.6)
    const v = unirTrozos(lotsView([base, trozo, otro], 1, 'EUR', null, now))
    expect(v).toHaveLength(2)
    expect(v[0]).toMatchObject({ trozos: 2, lotIds: ['lote-hw', 'lote-trozo'], quantity: 100.2, next: true, sourceWalletName: 'W origen' })
    expect(v[0].cost).toBeCloseTo(50.1, 9)
    expect(v[0].pnl).toBeCloseTo(50.1, 9)
    expect(v[1].trozos).toBe(1)
  })
  it('no une lotes de otra wallet ni con otro precio', () => {
    const v = unirTrozos(lotsView([
      lot('hw', '2026-06-01T18:08:12Z', 1, 1, 0.5),
      lot('spot', '2026-06-01T18:08:12Z', 1, 1, 0.5),
      { ...lot('hw', '2026-06-01T18:08:12Z', 1, 1, 0.7), lot_id: 'lote-caro' },
    ], 1, 'EUR', null, now))
    expect(v.map(l => l.trozos)).toEqual([1, 1, 1])
  })
})
