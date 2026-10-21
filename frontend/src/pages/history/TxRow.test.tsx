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
    import_id: null, import_filename: null, tx_hash: null,
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

describe('TxRow — accesibilidad (#351)', () => {
  it('el botón de detalle anuncia su estado (aria-expanded) y controla la fila de detalle', () => {
    const cerrada = render(tx({}))
    expect(cerrada).toMatch(/aria-expanded="false"[^>]*aria-label="Expandir detalle"/)
    const abierta = renderToStaticMarkup(
      <QueryClientProvider client={new QueryClient()}><table><tbody>
        <TxRow tx={tx({})} currency="EUR" onDelete={() => {}} onEdit={() => {}} isDeleting={false} searchTerm="" defaultExpanded />
      </tbody></table></QueryClientProvider>,
    )
    expect(abierta).toContain('aria-expanded="true" aria-controls="tx-detalle-00000000-0000-0000-0000-000000000001"')
    expect(abierta).toContain('id="tx-detalle-00000000-0000-0000-0000-000000000001"')
  })

  it('la insignia «M» tiene nombre accesible', () => {
    const html = render(tx({ manually_added: true }))
    expect(html).toContain('<span class="sr-only">Añadida manualmente</span>')
  })

  it('las acciones se muestran con foco dentro de la fila y en pantallas táctiles', () => {
    const html = render(tx({ manually_added: true }))
    expect(html).toContain('group-focus-within:opacity-100')
    expect(html).toContain('[@media(hover:none)]:opacity-100')
  })
})
