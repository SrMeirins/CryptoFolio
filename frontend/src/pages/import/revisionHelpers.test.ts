import { describe, expect, it } from 'vitest'
import { rellenoConMercado, siguientePendiente, sugerenciasPendientes } from './revisionHelpers'
import { etiquetaDestino } from './specialDestinations'
import type { DepositReview, PreviewTransaction } from './types'

// Revisión más ágil (#321). Datos sintéticos.
const tx = (hash: string, asset: string, account = 'Spot'): PreviewTransaction =>
  ({ operationType: 'WITHDRAW', timestamp: '2024-01-01T00:00:00Z', asset, amount: 1, amountNet: 1, account, subTradeCount: 1, rawRowHashes: [hash] })
const key = (t: PreviewTransaction) => t.rawRowHashes![0]

describe('sugerenciasPendientes', () => {
  it('sugiere el destino recordado solo para lo que no tiene destino', () => {
    const s = sugerenciasPendientes([tx('a', 'XRP'), tx('b', 'XRP'), tx('c', 'ADA', 'Funding')], { b: '__gift__' },
      { 'XRP|Spot': 'w1', 'ADA|Funding': '__external__' }, ['w1'], key)
    expect(s).toEqual({ a: 'w1', c: '__external__' })
  })

  it('descarta un recuerdo que apunta a una wallet que ya no existe', () => {
    expect(sugerenciasPendientes([tx('a', 'XRP')], {}, { 'XRP|Spot': 'borrada' }, ['w1'], key)).toEqual({})
  })
})

describe('siguientePendiente', () => {
  const items = [{ id: 'g1', pendiente: true }, { id: 'g2', pendiente: false }, { id: 'g3', pendiente: true }]
  it('avanza al siguiente pendiente y da la vuelta', () => {
    expect(siguientePendiente(items, null)).toBe('g1')
    expect(siguientePendiente(items, 'g1')).toBe('g3')
    expect(siguientePendiente(items, 'g3')).toBe('g1')
    expect(siguientePendiente(items, 'desaparecido')).toBe('g1')
  })
  it('null cuando no queda nada', () => {
    expect(siguientePendiente([{ id: 'g', pendiente: false }], null)).toBeNull()
  })
})

describe('rellenoConMercado', () => {
  const dep = (txKey: string, historicalPrice: number | null): DepositReview => ({ txKey, timestamp: '2024-01-01T00:00:00Z', asset: 'XRP', amount: 2, historicalPrice })
  it('usa el precio de cada depósito sin revisar y respeta los ya revisados', () => {
    expect(rellenoConMercado([dep('a', 0.5), dep('b', null), dep('c', 0.7), dep('d', 0)], { c: 1 })).toEqual({ a: 0.5 })
  })
})

describe('etiquetaDestino', () => {
  it('nombre del especial o de la wallet; null si no existe', () => {
    expect(etiquetaDestino('__gift__', [])).toBe('Regalo o pago a tercero')
    expect(etiquetaDestino('w1', [{ id: 'w1', name: 'Ledger' }])).toBe('Ledger')
    expect(etiquetaDestino('x', [])).toBeNull()
  })
})
