import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { CryptoRowComponent } from './AssetTableCryptoRow'
import type { CryptoRow } from '../utils/assetTable'

// Fila de Portfolio con y sin detalle (#460). Datos sintéticos.
const row: CryptoRow = {
  kind: 'crypto', asset: 'SINT', value: 100, totalQuantity: 10, totalCostBasis: 80, avgPrice: 8,
  wallets: [{ wallet_id: 'w1', wallet_name: 'Cartera', wallet_color: '#6366f1', wallet_kind: 'hardware', quantity: 10, costBasis: 80 }],
}
const render = (onOpen?: (a: string) => void) => renderToStaticMarkup(
  <QueryClientProvider client={new QueryClient()}>
    <MemoryRouter>
      <table><tbody><CryptoRowComponent row={row} prices={{ SINT: 10 }} yesterdayPrices={{}} totalPortfolioValue={1000} onOpen={onOpen} /></tbody></table>
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
