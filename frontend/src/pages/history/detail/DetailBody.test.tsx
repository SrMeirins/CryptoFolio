import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { TransactionDetail } from '../../../api/portfolio'
import { makeTx } from '../../../test/fixtures/transaction'
import { DetailBody } from './DetailBody'

// Render estático del contenido del panel de detalle (#373), con datos sintéticos.
function detail(overrides: Partial<TransactionDetail> = {}): TransactionDetail {
  return {
    transaction: makeTx({ operation_type: 'SELL', asset: 'BTC', value_eur: 300, value_source: 'fifo' }),
    fifo: { consumed: [], totals: { cost_eur: 0, proceeds_eur: 0, gain_loss_eur: 0 }, opened: [] },
    origin: { import: null, source_rows: 0 },
    onchain: { tx_hash: null, address: null, network: null, tx_url: null, address_url: null },
    fiscal_years: [],
    ...overrides,
  }
}

const render = (d: TransactionDetail) => renderToStaticMarkup(
  <QueryClientProvider client={new QueryClient()}>
    <MemoryRouter><DetailBody data={d} currency="EUR" onOpen={() => {}} /></MemoryRouter>
  </QueryClientProvider>,
)

const consumo = {
  id: 'c1', lot_id: 'l1', asset: 'BTC', wallet_name: 'Exchange', opened_at: '2025-03-01T10:00:00.000Z',
  origin: { id: 'buy-1', operation_type: 'BUY', timestamp: '2025-03-01T10:00:00.000Z' },
  quantity: 0.01, cost_eur: 200, proceeds_eur: 300, gain_loss_eur: 100, fiscal_event_type: 'GAIN' as const,
}

describe('DetailBody — trazabilidad FIFO (#373)', () => {
  it('una venta muestra los lotes que consume y los totales con su G/P', () => {
    const html = render(detail({ fifo: { consumed: [consumo], totals: { cost_eur: 200, proceeds_eur: 300, gain_loss_eur: 100 }, opened: [] } }))
    expect(html).toContain('De dónde salen las unidades')
    expect(html).toContain('Valor de transmisión')
    expect(html).toContain('+100,00')
  })

  it('una transferencia sin efecto fiscal no muestra G/P ni totales', () => {
    const html = render(detail({ fifo: { consumed: [{ ...consumo, fiscal_event_type: 'NONE', gain_loss_eur: null }], totals: { cost_eur: 0, proceeds_eur: 0, gain_loss_eur: 0 }, opened: [] } }))
    expect(html).toContain('sin efecto fiscal')
    expect(html).not.toContain('Valor de transmisión')
  })

  it('una compra muestra el lote que abre y quién lo consumió', () => {
    const html = render(detail({ fifo: { consumed: [], totals: { cost_eur: 0, proceeds_eur: 0, gain_loss_eur: 0 }, opened: [{
      id: 'l1', asset: 'BTC', wallet_name: 'Exchange', opened_at: '2025-03-01T10:00:00.000Z', is_closed: false,
      quantity_original: 0.02, quantity_remaining: 0.01, price_per_unit_eur: 20000, fee_eur: 0,
      consumed_by: [{ transaction_id: 'sell-1', operation_type: 'SELL', timestamp: '2026-01-15T10:30:00.000Z', quantity: 0.01, proceeds_eur: 300, gain_loss_eur: 100, fiscal_event_type: 'GAIN' }],
    }] } }))
    expect(html).toContain('Adónde van las unidades')
    expect(html).toContain('quedan 0,01')
  })
})

describe('DetailBody — origen, on-chain y enlaces (#373)', () => {
  it('una manual indica que no procede de ningún archivo', () => {
    const html = render(detail({ transaction: makeTx({ manually_added: true }) }))
    expect(html).toContain('Añadida manualmente')
  })

  it('indica el archivo y cuántas filas agrupa, con el nombre como texto literal', () => {
    const html = render(detail({ origin: {
      import: { id: 'imp-1', filename: '<img src=x>.csv', exchange: 'binance', imported_at: '2026-01-20T10:00:00.000Z' },
      source_rows: 3,
    } }))
    expect(html).toContain('href="/history?importacion=imp-1"')
    expect(html).toContain('Agrupa 3 filas del archivo.')
    expect(html).toContain('&lt;img src=x&gt;.csv')
    expect(html).not.toContain('<img src=x>')
  })

  it('el explorador abre en pestaña nueva sin referrer y lo anuncia', () => {
    const html = render(detail({ onchain: { tx_hash: 'abc', address: null, network: 'XRP', tx_url: 'https://explorer.example/tx/abc', address_url: null } }))
    expect(html).toContain('target="_blank" rel="noopener noreferrer"')
    expect(html).toContain('abre un sitio externo en una pestaña nueva')
  })

  it('sin hash ni dirección no hay sección on-chain', () => {
    expect(render(detail())).not.toContain('On-chain')
  })

  it('enlaza Fiscal de cada año con efecto fiscal y el activo en Portfolio', () => {
    const html = render(detail({ fiscal_years: [2025, 2026] }))
    expect(html).toContain('href="/fiscal?anio=2025&amp;vista=operaciones"')
    expect(html).toContain('href="/fiscal?anio=2026&amp;vista=operaciones"')
    expect(html).toContain('href="/portfolio?activo=BTC"')
  })
})

describe('DetailBody — comisiones (#371, #373)', () => {
  it('desglosa las comisiones agrupadas dentro de la lista de definiciones', () => {
    const html = render(detail({ transaction: makeTx({ operation_type: 'SELL', grouped_fees: [
      { id: 'f1', asset: 'BNB', amount: '0.01', value_eur: 3, value_source: 'fifo' },
    ] }) }))
    expect(html).toContain('<dt class="text-fg-subtle">Comisiones de esta operación</dt>')
    expect(html).toContain('0,01 BNB')
  })

  it('una comisión suelta enlaza con su operación', () => {
    const html = render(detail({ transaction: makeTx({ operation_type: 'FEE_EXCHANGE', fee_parent_id: 'abc-123' }) }))
    expect(html).toContain('Comisión de')
    expect(html).toContain('La compra o venta del mismo instante')
  })
})
