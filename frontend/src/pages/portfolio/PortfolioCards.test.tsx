import { describe, expect, it } from 'vitest'
import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { InventoryStrip } from './InventoryStrip'
import { WalletCards } from './WalletCards'
import type { Inventory, WalletSummary } from '../../utils/portfolioInventory'

// Franja de inventario y tarjetas de wallet con StatCard (#417). Datos sintéticos.
const withQuery = (node: ReactNode) => renderToStaticMarkup(<QueryClientProvider client={new QueryClient()}>{node}</QueryClientProvider>)

const wallet = (over: Partial<WalletSummary> = {}): WalletSummary => ({
  walletId: 'w1', name: 'Cartera fría', color: '#6366f1', kind: 'hardware', value: 1000, pct: 80, assetCount: 3,
  composition: { top: [{ asset: 'SINT', value: 700, pct: 70 }, { asset: 'PRUEBA', value: 300, pct: 30 }], others: { value: 0, pct: 0, count: 0 } },
  pnl: 120, pnlPct: 13.6, avgOpenedAt: Date.parse('2025-06-01T00:00:00Z'), ...over,
})

const inventory = (over: Partial<Inventory> = {}): Inventory => ({
  total: 1250, custody: { exchange: 250, self: 1000, exchangePct: 20 },
  positions: { assets: 4, wallets: 2, top: { asset: 'SINT', pct: 56 } },
  locked: { value: 0, assets: 0 }, wallets: [wallet()], avgOpenedAt: Date.parse('2025-06-01T00:00:00Z'), ...over,
})

describe('InventoryStrip (#417)', () => {
  it('tres tarjetas estáticas; Autocustodia con su anillo', () => {
    const html = withQuery(<InventoryStrip inventory={inventory()} />)
    expect(html.match(/stat-card stat-card-in/g)).toHaveLength(3)
    expect(html).not.toContain('absolute inset-px')
    expect(html).toContain('Autocustodia')
    expect(html).toContain('stroke-brand')
    expect(html).toContain('Antigüedad media')
  })

  it('sin texto bajo las cifras: importes, mayor peso y fecha media en la ayuda', () => {
    const html = withQuery(<InventoryStrip inventory={inventory()} />)
    expect(html).not.toContain('en autocustodia')
    expect(html).not.toContain('Mayor peso')
    expect(html).not.toContain('Fecha media de compra')
  })

  it('con algo bloqueado, Bloqueado en lugar de la antigüedad', () => {
    const html = withQuery(<InventoryStrip inventory={inventory({ locked: { value: 50, assets: 1 } })} />)
    expect(html).toContain('Bloqueado')
    expect(html).not.toContain('Antigüedad media')
  })
})

describe('WalletCards (#417)', () => {
  it('color de la wallet, chip con el P&L y su %, y barra de composición', () => {
    const html = withQuery(<WalletCards wallets={[wallet()]} selected={null} onSelect={() => {}} />)
    expect(html).toContain('--card:#6366f1')
    expect(html).toMatch(/\+120,00\s€ · \+13,6%/)
    expect(html).toContain('Composición: SINT 70,0% · PRUEBA 30,0%')
    expect(html).not.toContain('del total')
    expect(html).not.toContain('3 activos')
  })

  it('botón que filtra, con estado activo y sin atenuar las demás', () => {
    const html = withQuery(<WalletCards wallets={[wallet(), wallet({ walletId: 'w2', name: 'Exchange' })]} selected="w1" onSelect={() => {}} />)
    expect(html).toContain('aria-pressed="true"')
    expect(html).toContain('Quitar el filtro de la tabla')
    expect(html).toContain('Filtrar la tabla por esta wallet')
    expect(html).not.toContain('opacity-60')
  })

  it('sin coste, sin chip de P&L', () => {
    expect(withQuery(<WalletCards wallets={[wallet({ pnl: null, pnlPct: null })]} selected={null} onSelect={() => {}} />)).not.toContain('P&amp;L no realizado')
  })
})
