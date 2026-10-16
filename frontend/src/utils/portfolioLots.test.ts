import { describe, expect, it } from 'vitest'
import type { OpenLot } from '../api/portfolio'
import { formatAge, formatLotDate, lotDateDetail, lotSourceLabel, lotsView } from './portfolioLots'

// Lotes FIFO del panel de detalle (#272).
const lot = (wallet: string, openedAt: string, original: number, remaining: number, unit: number, usdPerEur: string | null = null): OpenLot => ({
  wallet_id: wallet, wallet_name: `W ${wallet}`, wallet_color: '#123456', wallet_kind: 'exchange', opened_at: openedAt,
  quantity_original: String(original), quantity_remaining: String(remaining), price_per_unit_eur: String(unit),
  cost_basis_eur: String(remaining * unit), usd_per_eur: usdPerEur, source_type: 'BUY',
})
const now = new Date('2026-10-16T00:00:00Z')

describe('lotsView', () => {
  const lots = [
    lot('funding', '2024-02-01T00:00:00Z', 10, 10, 0.5),
    lot('spot', '2024-01-01T00:00:00Z', 50, 50, 1),
    lot('spot', '2025-10-16T00:00:00Z', 100, 40, 3),
  ]

  it('P&L por lote al precio actual y el primero de cada wallet como siguiente en venderse', () => {
    const v = lotsView(lots, 2, 'EUR', null, now)
    expect(v.map(l => [l.walletId, l.next, l.pnl])).toEqual([['funding', true, 15], ['spot', true, 50], ['spot', false, -40]])
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

describe('lotSourceLabel', () => {
  const labels = { BUY: { label: 'Compra' }, WITHDRAW: { label: 'Retirada' } }
  it('los lotes llegados por transferencia se muestran como traspaso, no como retirada', () => {
    expect(lotSourceLabel('WITHDRAW', labels)).toBe('Traspaso desde otra wallet')
    expect(lotSourceLabel('TRANSFER_INTERNAL', labels)).toBe('Traspaso desde otra wallet')
  })
  it('el resto, con su etiqueta; sin etiqueta, el tipo tal cual', () => {
    expect(lotSourceLabel('BUY', labels)).toBe('Compra')
    expect(lotSourceLabel('NUEVO', labels)).toBe('NUEVO')
  })
})
