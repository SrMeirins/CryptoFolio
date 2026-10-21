import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { Transaction } from '../../api/portfolio'
import { TxRow } from './TxRow'

// Render estático (sin DOM ni efectos) de una fila del Historial (#346).
function tx(overrides: Partial<Transaction>): Transaction {
  return {
    id: '00000000-0000-0000-0000-000000000001',
    operation_type: 'WITHDRAW',
    timestamp: '2026-01-15T10:30:00.000Z',
    asset: 'XRP', amount: '10', amount_net: '10',
    cost_asset: null, cost_amount: null, price_per_unit: null,
    fee_asset: null, fee_amount: null,
    wallet_id: '00000000-0000-0000-0000-000000000002', wallet_name: 'Exchange', wallet_color: '#000000', wallet_kind: 'exchange',
    account: null, notes: null, manually_added: false, created_at: '2026-01-15T10:30:00.000Z',
    destination_wallet_id: null, destination_wallet_name: null, destination_wallet_color: null,
    linked_tx_id: null, linked_tx_timestamp: null, linked_tx_operation_type: null, linked_tx_amount: null, linked_tx_asset: null,
    value_eur: 5, value_source: 'estimado', fee_value_eur: null, fee_value_source: null,
    usd_per_eur: 1.1,
    ...overrides,
  }
}

function render(t: Transaction, currency: 'EUR' | 'USD' = 'EUR'): string {
  const client = new QueryClient()
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <table><tbody>
        <TxRow tx={t} currency={currency} onDelete={() => {}} onEdit={() => {}} isDeleting={false} searchTerm="" />
      </tbody></table>
    </QueryClientProvider>,
  )
}

describe('TxRow (#346)', () => {
  it('un valor estimado lleva «≈» y el motivo como texto accesible', () => {
    const html = render(tx({}))
    expect(html).toContain('≈ ')
    expect(html).toContain('5,00')
    expect(html).toMatch(/sr-only[^>]*> \(Estimado con el precio de cierre diario/)
  })

  it('sin precio muestra «—» con el motivo, sin inventar un importe', () => {
    const html = render(tx({ value_eur: null, value_source: 'sin_precio' }))
    expect(html).toContain('Sin precio disponible para esta fecha')
    expect(html).not.toContain('€')
  })

  it('un valor del FIFO se muestra sin marca de estimación', () => {
    const html = render(tx({ operation_type: 'SELL', value_eur: 28, value_source: 'fifo' }))
    expect(html).not.toContain('≈')
    expect(html).toContain('28,00')
  })

  it('los retiros llevan signo «−»', () => {
    expect(render(tx({}))).toContain('−10')
  })

  it('una nota con HTML se pinta como texto literal', () => {
    const html = render(tx({ notes: '<img src=x onerror=alert(1)>' }))
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;')
    expect(html).not.toContain('<img src=x')
  })
})
