import { describe, expect, it } from 'vitest'
import { toDisplayAmount, localDayKey, fmtDate, fmtDateGroup, calcEurValue, calcFeeEur, valuationHint, flowSign } from './helpers'

describe('toDisplayAmount (#177)', () => {
  it('EUR: el importe tal cual', () => {
    expect(toDisplayAmount(100, { usd_per_eur: 1.2 }, 'EUR')).toBe(100)
  })

  it('USD: con el tipo de la fecha de la operación (número o texto de la API)', () => {
    expect(toDisplayAmount(100, { usd_per_eur: 1.2 }, 'USD')).toBeCloseTo(120, 10)
    expect(toDisplayAmount(100, { usd_per_eur: '1.1' }, 'USD')).toBeCloseTo(110, 10)
  })

  it('USD sin tipo válido: null, nunca euros mostrados como dólares', () => {
    for (const usd_per_eur of [null, undefined, 0, 'abc']) {
      expect(toDisplayAmount(100, { usd_per_eur }, 'USD')).toBeNull()
    }
  })

  it('sin importe: null en ambas monedas', () => {
    expect(toDisplayAmount(null, { usd_per_eur: 1.2 }, 'USD')).toBeNull()
    expect(toDisplayAmount(null, { usd_per_eur: 1.2 }, 'EUR')).toBeNull()
  })
})

describe('fechas en hora local (#346)', () => {
  it('agrupa por el día local: las 23:30Z del 10/03 son las 00:30 del 11 en Madrid', () => {
    expect(localDayKey('2024-03-10T23:30:00Z')).toBe('2024-03-11')
    expect(fmtDate('2024-03-10T23:30:00Z').time).toBe('00:30')
  })

  it('en verano (UTC+2) también usa el día local', () => {
    expect(localDayKey('2024-07-31T22:15:00Z')).toBe('2024-08-01')
  })

  it('cabecera del día con solo la inicial en mayúscula', () => {
    expect(fmtDateGroup('2026-09-03')).toBe('Jueves, 3 de septiembre de 2026')
  })
})

describe('valoración del backend (#346)', () => {
  it('calcEurValue y calcFeeEur usan los valores calculados por la API', () => {
    expect(calcEurValue({ value_eur: 56 })).toBe(56)
    expect(calcEurValue({ value_eur: null })).toBeNull()
    expect(calcFeeEur({ fee_value_eur: 4 })).toBe(4)
  })

  it('solo las cifras estimadas o sin precio llevan aviso', () => {
    expect(valuationHint('coste')).toBeNull()
    expect(valuationHint('fifo')).toBeNull()
    expect(valuationHint(null)).toBeNull()
    expect(valuationHint('estimado')).toMatch(/cierre diario/)
    expect(valuationHint('sin_precio')).toMatch(/Sin precio/)
  })
})

describe('flowSign (#346)', () => {
  it('entradas con «+», salidas (incluidos retiros y comisiones) con «−», movimientos internos sin signo', () => {
    expect(flowSign('BUY')).toBe('+')
    expect(flowSign('STAKING_REWARD')).toBe('+')
    expect(flowSign('WITHDRAW')).toBe('−')
    expect(flowSign('FEE_EXCHANGE')).toBe('−')
    expect(flowSign('TRANSFER_INTERNAL')).toBe('')
    expect(flowSign('STAKING_LOCK')).toBe('')
  })
})
