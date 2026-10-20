import { describe, expect, it } from 'vitest'
import { nadaQueImportar, newTransactions, newWithdrawals, loteIlegible } from './reviewSelection'
import type { PreviewResult, PreviewTransaction } from './types'

// Revisión solo de lo nuevo (#316). Datos sintéticos.
const tx = (p: Partial<PreviewTransaction>): PreviewTransaction => ({
  operationType: 'BUY', timestamp: '2026-01-01T00:00:00Z', asset: 'BTC', amount: 1, amountNet: 1, account: 'Spot', subTradeCount: 1,
  rawRowHashes: [Math.random().toString(36)], isNew: true, ...p,
})
const preview = (txs: PreviewTransaction[], depositReviews: PreviewResult['depositReviews'] = []): PreviewResult => ({
  validation: { valid: true, errors: [], warnings: [], info: [], detectedLanguage: 'en', unknownOperations: [], rowCount: txs.length, dateRange: null },
  transactions: txs, duplicateCount: txs.filter(t => !t.isNew).length, newCount: txs.filter(t => t.isNew).length,
  errors: [], unknownOperationSamples: {}, depositReviews,
})

describe('revisión solo de lo nuevo', () => {
  const p = preview([
    tx({ operationType: 'WITHDRAW', isNew: false, timestamp: '2026-01-01T00:00:00Z' }),
    tx({ operationType: 'WITHDRAW', isNew: true, timestamp: '2026-03-01T00:00:00Z', asset: 'XRP' }),
    tx({ operationType: 'WITHDRAW', isNew: true, timestamp: '2026-02-01T00:00:00Z', asset: 'ADA' }),
    tx({ isNew: false }),
  ])
  it('los retiros duplicados no se piden', () => {
    expect(newWithdrawals(p).map(t => t.asset)).toEqual(['ADA', 'XRP'])
    expect(newTransactions(p)).toHaveLength(2)
  })
  it('sin filas nuevas ni depósitos pendientes: nada que importar', () => {
    expect(nadaQueImportar(preview([tx({ isNew: false })]))).toBe(true)
    expect(nadaQueImportar(p)).toBe(false)
    expect(nadaQueImportar(preview([tx({ isNew: false })], [{ txKey: 'u', timestamp: '', asset: 'BTC', amount: 1, historicalPrice: null, existingInDb: true }]))).toBe(false)
  })
})

describe('loteIlegible (#326)', () => {
  const a = (estado: 'listo' | 'no_reconocido') => ({ indice: 0, nombre: 'x.csv', exchange: 'binance' as const, reconocido: false, estado, motivo: null, nuevas: 0, duplicadas: 0, repetidasEnLote: 0, rango: null })
  const base = { validation: { valid: false, errors: [], warnings: [], info: [], detectedLanguage: 'unknown', unknownOperations: [], rowCount: 0, dateRange: null }, transactions: [], duplicateCount: 0, newCount: 0, errors: [], unknownOperationSamples: {}, depositReviews: [] }
  it('solo cuando todos los archivos de un lote son ilegibles', () => {
    expect(loteIlegible({ ...base, archivos: [a('no_reconocido'), a('no_reconocido')] })).toBe(true)
    expect(loteIlegible({ ...base, archivos: [a('no_reconocido'), a('listo')] })).toBe(false)
    expect(loteIlegible({ ...base, archivos: [a('no_reconocido')] })).toBe(false)
  })
})
