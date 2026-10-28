import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { AssetMetadata } from '../../../api/portfolio'
import { AssetsTable } from './AssetsTable'

// Tabla de Activos (#450). Datos sintéticos.
const a = (symbol: string, over: Partial<AssetMetadata> = {}): AssetMetadata => ({
  symbol, name: `${symbol} nombre`, coingecko_id: null, is_stablecoin: false, binance_eur_pair: `${symbol}EUR`, binance_usdt_pair: null, binance_btc_pair: null,
  price_source: 'eur_direct', auto_detected: false, last_price_check: null, ...over,
} as AssetMetadata)

const render = (assets: AssetMetadata[], priceOf = (x: AssetMetadata) => (x.symbol === 'SINTA' ? 1234.5 : null)) => renderToStaticMarkup(
  <QueryClientProvider client={new QueryClient()}>
    <MemoryRouter>
      <AssetsTable assets={assets} priceOf={priceOf} currency="EUR" sort={{ col: 'precio', dir: 'desc' }}
        onSort={() => {}} onEdit={() => {}} onDelete={() => {}} />
    </MemoryRouter>
  </QueryClientProvider>,
)

describe('AssetsTable (#450)', () => {
  it('cabeceras ordenables con aria-sort; la activa indica la dirección', () => {
    const html = render([a('SINTA')])
    expect(html).toContain('aria-sort="descending"')
    expect(html.match(/aria-sort="none"/g)).toHaveLength(4)
  })

  it('precio con el € detrás, estado y uso con enlace al Historial', () => {
    const html = render([a('SINTA', { en_cartera: true, operaciones: 3 })])
    expect(html).toMatch(/1\.234,50\s€/)
    expect(html).toContain('En vivo')
    expect(html).toContain('En cartera')
    expect(html).toContain('href="/history?buscar=SINTA"')
    expect(html).toContain('3 operaciones')
  })

  it('sin operaciones se puede borrar; con ellas, el botón se desactiva', () => {
    const libre = render([a('SINTB')])
    expect(libre).toContain('Sin uso, se puede borrar')
    expect(libre.match(/<button[^>]*aria-label="Eliminar SINTB"[^>]*>/)![0]).not.toContain('disabled=""')
    const usado = render([a('SINTC', { operaciones: 1 })])
    expect(usado).toMatch(/aria-label="Eliminar SINTC" disabled=""/)
    expect(usado).toContain('Sin precio')
  })
})
