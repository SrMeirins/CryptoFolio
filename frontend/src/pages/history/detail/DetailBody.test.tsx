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
    origin: { import: null, source_rows: 0, original_rows: null },
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
  role: 'venta' as const, destination_name: null,
}

describe('DetailBody — trazabilidad FIFO (#373)', () => {
  it('una venta muestra los lotes que consume y los totales con su G/P', () => {
    const html = render(detail({ fifo: { consumed: [consumo], totals: { cost_eur: 200, proceeds_eur: 300, gain_loss_eur: 100 }, opened: [] } }))
    expect(html).toContain('De dónde salen las unidades')
    expect(html).toContain('Efecto fiscal (la venta)')
    expect(html).toContain('+100,00')
  })

  it('una transferencia sin efecto fiscal no muestra G/P ni totales', () => {
    const html = render(detail({ fifo: { consumed: [{ ...consumo, fiscal_event_type: 'NONE', gain_loss_eur: null, role: 'traslado', destination_name: 'Fría' }], totals: { cost_eur: 0, proceeds_eur: 0, gain_loss_eur: 0 }, opened: [] } }))
    expect(html).toContain('Traslado a Fría')
    expect(html).toContain('sin efecto fiscal')
    expect(html).toContain('Sin efecto fiscal: es un traslado entre wallets propias.')
    expect(html).not.toContain('Efecto fiscal (')
  })

  it('una compra muestra el lote que abre y quién lo consumió', () => {
    const html = render(detail({ fifo: { consumed: [], totals: { cost_eur: 0, proceeds_eur: 0, gain_loss_eur: 0 }, opened: [{
      id: 'l1', asset: 'BTC', wallet_name: 'Exchange', opened_at: '2025-03-01T10:00:00.000Z', is_closed: false,
      quantity_original: 0.02, quantity_remaining: 0.01, price_per_unit_eur: 20000, fee_eur: 0,
      source: null,
      consumed_by: [{ transaction_id: 'sell-1', operation_type: 'SELL', timestamp: '2026-01-15T10:30:00.000Z', quantity: 0.01, proceeds_eur: 300, gain_loss_eur: 100, fiscal_event_type: 'GAIN', role: 'venta', destination_name: null }],
    }] } }))
    expect(html).toContain('Adónde van las unidades')
    expect(html).toContain('Sin usar 0,01 de 0,02')
    expect(html).toContain('50 % usado')
    expect(html).not.toContain('Viene de')
  })
})

// Retiro con comisión de red en el mismo activo (#405), datos sintéticos.
describe('DetailBody — papel de cada consumo y lotes trasladados (#405)', () => {
  const traslado = { ...consumo, fiscal_event_type: 'NONE' as const, gain_loss_eur: 0, role: 'traslado' as const, destination_name: 'Fría' }
  const comision = { ...consumo, id: 'c2', quantity: 1, cost_eur: 0.93, proceeds_eur: 0.934, gain_loss_eur: 0.004, role: 'comision_red' as const, destination_name: 'Fría' }
  const lote = (id: string, qty: number) => ({
    id, asset: 'BTC', wallet_name: 'Fría', opened_at: '2025-03-01T10:00:00.000Z', is_closed: false,
    quantity_original: qty, quantity_remaining: qty, price_per_unit_eur: 1, fee_eur: 0,
    source: { id: `buy-${id}`, operation_type: 'BUY', timestamp: '2025-03-01T10:00:00.000Z' }, consumed_by: [],
  })
  const html = () => render(detail({ fifo: {
    consumed: [comision, traslado], totals: { cost_eur: 0.93, proceeds_eur: 0.934, gain_loss_eur: 0.004 },
    opened: [lote('a', 9), lote('b', 5)],
  } }))

  it('separa la comisión de red del traslado y dice qué tiene efecto fiscal', () => {
    const h = html()
    expect(h).toContain('Comisión de red')
    expect(h).toContain('Traslado a Fría')
    expect(h).toContain('Efecto fiscal (solo la comisión de red)')
  })

  it('una ganancia de 0,004 € no se redondea a 0,00 €', () => {
    expect(html()).toMatch(/\+0,004/)
    expect(html()).not.toContain('+0,00 €')
  })

  it('con varios lotes trasladados explica por qué y enlaza cada uno a su compra', () => {
    const h = html()
    expect(h).toContain('Un lote por cada compra de origen')
    expect(h.match(/Viene de/g)).toHaveLength(2)
    expect(h).toContain('Sin usar 9 de 9')
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
      source_rows: 3, original_rows: null,
    } }))
    expect(html).toContain('href="/history?importacion=imp-1"')
    expect(html).toContain('Agrupa 3 filas del archivo.')
    expect(html).toContain('&lt;img src=x&gt;.csv')
    expect(html).not.toContain('<img src=x>')
  })

  const IMPORT = { id: 'imp-1', filename: 'orden.csv', exchange: 'binance', imported_at: '2026-01-20T10:00:00.000Z' }

  it('importada antes de #374: recuento y cómo completar las filas', () => {
    const html = render(detail({ origin: { import: IMPORT, source_rows: 2, original_rows: null } }))
    expect(html).toContain('vuelve a importar este archivo para verlas')
    expect(html).not.toContain('<table')
  })

  it('filas originales (#374): tabla sin columnas vacías y el texto como literal', () => {
    const html = render(detail({ origin: { import: IMPORT, source_rows: 2, original_rows: {
      columns: ['Time', 'Operation', 'Change', 'Remark'],
      rows: [['2024-02-01 10:00:00', 'Transaction Buy', '40', '<b>fill</b>'], ['2024-02-01 10:00:00', 'Transaction Buy', '60', '']],
    } } }))
    expect(html).toContain('<caption class="sr-only">Filas originales del archivo</caption>')
    expect(html).toContain('<th scope="col"')
    expect(html).toContain('&lt;b&gt;fill&lt;/b&gt;')
    expect(html).not.toContain('<b>fill</b>')
    expect(html).not.toContain('vuelve a importar')
    expect(html).not.toContain('Mostrar las')
  })

  it('con más de 5 filas muestra las primeras y un botón para el resto', () => {
    const rows = Array.from({ length: 7 }, (_, i) => ['t', String(i)])
    const html = render(detail({ origin: { import: IMPORT, source_rows: 7, original_rows: { columns: ['Time', 'Change'], rows } } }))
    expect(html.match(/<tr class="border-t/g)).toHaveLength(5)
    expect(html).toContain('Mostrar las 7 filas')
    expect(html).toContain('aria-expanded="false"')
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

describe('DetailBody — importada editada (#378)', () => {
  const original = {
    operation_type: 'SELL', timestamp: '2026-01-15T10:30:00.000Z', asset: '<b>BTC</b>', amount: 10, amount_net: 10,
    cost_asset: null, cost_amount: null, price_per_unit: null, fee_asset: null, fee_amount: null,
    wallet_id: '00000000-0000-0000-0000-000000000002', destination_wallet_id: null, destination_pending: false,
  }

  it('muestra los cambios y «Restaurar original», con los valores como texto literal', () => {
    const html = render(detail({ transaction: makeTx({ operation_type: 'SELL', asset: 'BTC', amount: '12', amount_net: '12', original_import: original }) }))
    expect(html).toContain('Editada a mano')
    expect(html).toContain('Cambios respecto a los valores importados')
    expect(html).toContain('Restaurar original')
    expect(html).toContain('&lt;b&gt;BTC&lt;/b&gt;')
    expect(html).not.toContain('<b>BTC</b>')
  })

  it('sin edición no hay sección', () => {
    expect(render(detail())).not.toContain('Editada a mano')
  })
})
