import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { CryptoRowComponent } from './AssetTableCryptoRow'
import type { CryptoRow } from '../utils/assetTable'
import { COLUMNAS_DEFECTO, columnasVisibles, type ColumnKey } from '../utils/portfolioColumns'
import type { RowMetrics } from '../utils/positionMetrics'

// Fila de Portfolio con y sin detalle (#460). Datos sintéticos.
const row: CryptoRow = {
  kind: 'crypto', asset: 'SINT', value: 100, totalQuantity: 10, totalCostBasis: 80, avgPrice: 8,
  wallets: [{ wallet_id: 'w1', wallet_name: 'Cartera', wallet_color: '#6366f1', wallet_kind: 'hardware', quantity: 10, costBasis: 80 }],
}
const render = (onOpen?: (a: string) => void, cols: readonly ColumnKey[] = COLUMNAS_DEFECTO, metrics?: RowMetrics) => renderToStaticMarkup(
  <QueryClientProvider client={new QueryClient()}>
    <MemoryRouter>
      <table><tbody><CryptoRowComponent row={row} columns={columnasVisibles(cols, { compact: false, parcial: false })} metrics={metrics}
        prices={{ SINT: 10 }} yesterdayPrices={{}} totalPortfolioValue={1000} onOpen={onOpen} /></tbody></table>
    </MemoryRouter>
  </QueryClientProvider>,
)

describe('CryptoRowComponent, acceso al detalle (#460)', () => {
  it('con onOpen: botón de detalle siempre visible (atenuado) y nombre con estilo de enlace', () => {
    const html = render(() => {})
    expect(html).toMatch(/aria-label="Detalle de SINT"[^>]*class="[^"]*opacity-60/)
    expect(html).toMatch(/aria-label="Ver detalle de SINT"[^>]*class="[^"]*underline/)
  })

  it('sin onOpen: ni botón de detalle ni nombre clicable', () => {
    const html = render()
    expect(html).not.toContain('Detalle de SINT')
    expect(html).not.toContain('Ver detalle de SINT')
  })
})

// Columnas configurables (#527).
describe('CryptoRowComponent, columnas visibles (#527)', () => {
  const celdas = (html: string) => (html.split('</tr>')[0].match(/<td/g) ?? []).length
  it('una celda por columna elegida más activo y valor; la cantidad, bajo el activo', () => {
    expect(celdas(render(undefined, ['cantidad', 'pnl']))).toBe(3)
    expect(celdas(render(undefined, []))).toBe(2)
  })
  it('valor detrás del precio y antes del coste', () => {
    const html = render(undefined, ['precio', 'coste'])
    const tds = html.split('</tr>')[0].split('<td').slice(1)
    expect(tds[1]).toContain('10,00')             // precio
    expect(tds[2]).toContain('font-semibold')     // valor
    expect(tds[3]).toContain('80')                // coste
  })
  it('resultado total sin desglose en la celda y antigüedad compacta', () => {
    const m: RowMetrics = { resultado: 45, noRealizado: 20, realizado: 25, realizadoPartes: [{ categoria: 'ventas', value: 25, operations: 2 }],
      ageDays: 400, desdeMaximo: { pct: -12.5, max: 11.43 }, ingresos: { value: 7, operations: 3 } }
    const html = render(undefined, ['resultado', 'antiguedad', 'maximo90', 'ingresos'], m)
    expect(html).toContain('+45')
    expect(html).not.toContain('realizado +25')
    expect(html).toContain('1 a 1 m')
    expect(html).toMatch(/-12,5\s?%/)
    expect(html).toContain('3 rentas')
  })
})
