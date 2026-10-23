import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { Transaction } from '../../api/portfolio'
import { makeTx } from '../../test/fixtures/transaction'
import { TxRow } from './TxRow'

// Render estático (sin DOM ni efectos) de una fila del Historial (#346).
const tx = makeTx

function render(t: Transaction, currency: 'EUR' | 'USD' = 'EUR', selected = false): string {
  const client = new QueryClient()
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <table><tbody>
        <TxRow tx={t} currency={currency} onDelete={() => {}} onEdit={() => {}} onOpen={() => {}} onPrefetch={() => {}}
          isDeleting={false} searchTerm="" selected={selected} />
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
  it('el botón «Ver detalle» anuncia que abre un diálogo (#373)', () => {
    const html = render(tx({}))
    expect(html).toMatch(/aria-haspopup="dialog"[^>]*aria-label="Ver detalle"/)
    expect(html).not.toContain('aria-expanded')
  })

  it('la fila con el detalle abierto se marca con aria-current (#373)', () => {
    expect(render(tx({}), 'EUR', true)).toContain('aria-current="true"')
    expect(render(tx({}))).not.toContain('aria-current')
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

describe('TxRow — comisiones agrupadas (#371)', () => {
  const fees = [
    { id: 'f1', asset: 'BNB', amount: '0.01', value_eur: 3, value_source: 'fifo' as const },
    { id: 'f2', asset: 'EUR', amount: '0.5', value_eur: 0.5, value_source: 'coste' as const },
  ]

  it('la columna Fee muestra el total y «+N comisiones»', () => {
    const html = render(tx({ operation_type: 'SELL', value_source: 'fifo', grouped_fees: fees }))
    expect(html).toContain('3,50')
    expect(html).toContain('+2 comisiones')
  })
})

describe('TxRow — importadas editadas (#378)', () => {
  it('la insignia «E» tiene nombre accesible y solo aparece si está editada', () => {
    expect(render(tx({ original_import: { operation_type: 'WITHDRAW', timestamp: '2026-01-15T10:30:00Z', asset: 'XRP', amount: 9, amount_net: 9,
      cost_asset: null, cost_amount: null, price_per_unit: null, fee_asset: null, fee_amount: null,
      wallet_id: '00000000-0000-0000-0000-000000000002', destination_wallet_id: null, destination_pending: false } })))
      .toContain('<span class="sr-only">Importada y editada a mano</span>')
    expect(render(tx({}))).not.toContain('editada a mano')
  })
})
