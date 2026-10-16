import { afterEach, describe, expect, it } from 'vitest'
import { setAmountsHidden } from './format'
import { fiscalDateDetail, fiscalTypeLabel, formatFiscalDate, formatFiscalQty } from './fiscalTable'

// Tabla de operaciones de Fiscal (#295). Datos sintéticos.
describe('fiscalTypeLabel', () => {
  it('tipos en castellano con su tono', () => {
    expect(fiscalTypeLabel('SELL')).toEqual({ label: 'Venta', tone: 'sale' })
    expect(fiscalTypeLabel('BUY')).toEqual({ label: 'Permuta', tone: 'swap' })
    expect(fiscalTypeLabel('FEE_EXCHANGE')).toEqual({ label: 'Comisión', tone: 'fee' })
    expect(fiscalTypeLabel('LOST')).toEqual({ label: 'Pérdida', tone: 'loss' })
    expect(fiscalTypeLabel('MARGIN_REPAY')).toEqual({ label: 'Margen', tone: 'margin' })
    expect(fiscalTypeLabel('RARO')).toEqual({ label: 'RARO', tone: 'other' })
  })
})

describe('fechas', () => {
  it('«1 ene 2026» a partir del día de Madrid', () => {
    expect(formatFiscalDate('2026-01-01')).toBe('1 ene 2026')
    expect(formatFiscalDate('2025-09-15')).toBe('15 sept 2025')
    expect(formatFiscalDate('no-fecha')).toBe('no-fecha')
  })
  it('detalle con la hora de Madrid', () => {
    expect(fiscalDateDetail('2025-12-31T23:30:00.000Z')).toBe('1 de enero de 2026, 00:30')
    expect(fiscalDateDetail(undefined)).toBeUndefined()
    expect(fiscalDateDetail('basura')).toBeUndefined()
  })
})

describe('formatFiscalQty', () => {
  it('sin notación científica', () => {
    expect(formatFiscalQty(0.00000229)).toBe('0,00000229')
    expect(formatFiscalQty(0.0000465)).toBe('0,0000465')
    expect(formatFiscalQty(0.052988)).toBe('0,052988')
    expect(formatFiscalQty(199.6778)).toBe('199,6778')
    expect(formatFiscalQty(22450.12)).toBe('22.450,12')
    expect(formatFiscalQty(0)).toBe('0')
    expect(formatFiscalQty(1e-15)).not.toMatch(/e/)
  })
})

describe('formatFiscalQty en modo privacidad', () => {
  afterEach(() => setAmountsHidden(false))
  it('oculta la cantidad', () => {
    setAmountsHidden(true)
    expect(formatFiscalQty(199.6778)).toBe('••••')
  })
})
