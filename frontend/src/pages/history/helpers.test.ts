import { describe, expect, it } from 'vitest'
import { toDisplayAmount, localDayKey, fmtDate, fmtDateGroup, calcEurValue, calcFeeEur, valuationHint, flowSign, feeSummary, walletFlow, rowFlowSign, fiatSideNote } from './helpers'

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

describe('feeSummary (#371)', () => {
  const base = { fee_amount: '0.1', fee_value_eur: 2, fee_value_source: 'fifo' as const, usd_per_eur: 1.1, grouped_fees: [] }
  const g = (value_eur: number | null, value_source: 'fifo' | 'estimado' | 'sin_precio' = 'fifo') =>
    ({ id: String(Math.random()), asset: 'BNB', amount: '0.01', value_eur, value_source })

  it('suma la comisión propia y las agrupadas', () => {
    expect(feeSummary({ ...base, grouped_fees: [g(3), g(5)] }, 'EUR')).toEqual({ count: 3, total: 10, missing: 0, estimated: false })
  })

  it('en USD con el tipo de la fecha; sin tipo, cuentan como sin precio', () => {
    expect(feeSummary({ ...base, grouped_fees: [g(3)] }, 'USD').total).toBeCloseTo(5.5, 10)
    expect(feeSummary({ ...base, usd_per_eur: null, grouped_fees: [g(3)] }, 'USD')).toMatchObject({ total: null, missing: 2 })
  })

  it('sin comisión propia, solo las agrupadas; marca estimadas y sin precio', () => {
    const s = feeSummary({ ...base, fee_amount: null, fee_value_eur: null, grouped_fees: [g(1, 'estimado'), g(null, 'sin_precio')] }, 'EUR')
    expect(s).toEqual({ count: 2, total: 1, missing: 1, estimated: true })
  })
})

// Sentido respecto a la wallet filtrada (#395).
describe('walletFlow y rowFlowSign (#395)', () => {
  const A = 'wallet-a', B = 'wallet-b'
  const retiro = { operation_type: 'WITHDRAW', wallet_id: A, destination_wallet_id: B }
  const transfer = { operation_type: 'TRANSFER_INTERNAL', wallet_id: A, destination_wallet_id: B }

  it('desde la wallet de destino es una entrada, con +', () => {
    expect(walletFlow(retiro, B)).toBe('entrada')
    expect(rowFlowSign(retiro, B)).toBe('+')
    expect(rowFlowSign(transfer, B)).toBe('+')
  })

  it('desde la wallet de origen es una salida, con -', () => {
    expect(walletFlow(transfer, A)).toBe('salida')
    expect(rowFlowSign(transfer, A)).toBe('−')
    expect(rowFlowSign(retiro, A)).toBe('−')
  })

  it('sin filtro, sin destino o hacia la misma wallet manda el tipo', () => {
    expect(walletFlow(retiro)).toBeNull()
    expect(rowFlowSign(transfer)).toBe('')
    expect(walletFlow({ wallet_id: A, destination_wallet_id: null }, A)).toBeNull()
    expect(rowFlowSign({ operation_type: 'BUY', wallet_id: A, destination_wallet_id: null }, A)).toBe('+')
    expect(walletFlow({ wallet_id: A, destination_wallet_id: A }, A)).toBeNull()
  })
})

// Filas registradas al revés por el exchange (#416).
describe('fiatSideNote (#416)', () => {
  const tx = (operation_type: string, asset: string, cost_asset: string | null) => ({ operation_type, asset, cost_asset })
  it('vender fiat es comprar la contrapartida y comprar fiat, venderla', () => {
    expect(fiatSideNote(tx('SELL', 'EUR', 'USDC'))).toBe('compra de USDC')
    expect(fiatSideNote(tx('BUY', 'EUR', 'ADA'))).toBe('venta de ADA')
  })
  it('sin aclaración en las normales o entre fiats', () => {
    expect(fiatSideNote(tx('BUY', 'XRP', 'EUR'))).toBeNull()
    expect(fiatSideNote(tx('SELL', 'BTC', 'USDT'))).toBeNull()
    expect(fiatSideNote(tx('SELL', 'EUR', 'USD'))).toBeNull()
    expect(fiatSideNote(tx('DEPOSIT_FIAT', 'EUR', null))).toBeNull()
  })
})
