import { describe, expect, it, vi } from 'vitest'
import type { QueryClient } from '@tanstack/react-query'
import { invalidateTransactionQueries } from './queryInvalidation'

function fakeClient() {
  const invalidateQueries = vi.fn()
  return { client: { invalidateQueries } as unknown as QueryClient, invalidated: () => invalidateQueries.mock.calls.map(c => c[0].queryKey[0]) }
}

describe('invalidateTransactionQueries', () => {
  it('invalida también las consultas por moneda (#177), por prefijo para ambas monedas', () => {
    const { client, invalidated } = fakeClient()
    invalidateTransactionQueries(client)
    expect(invalidated()).toEqual(expect.arrayContaining(['transactions', 'eur-flow', 'daily-pnl', 'intraday-pnl']))
    expect(invalidated()).not.toContain('imports')
  })

  it('includeImports añade la lista de importaciones', () => {
    const { client, invalidated } = fakeClient()
    invalidateTransactionQueries(client, { includeImports: true })
    expect(invalidated()).toContain('imports')
  })
})
