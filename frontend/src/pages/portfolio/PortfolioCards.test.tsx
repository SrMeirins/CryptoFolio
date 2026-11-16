import { describe, expect, it } from 'vitest'
import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { WalletCards } from './WalletCards'
import type { WalletSummary } from '../../utils/portfolioInventory'

// Tarjetas de wallet de Portfolio (#526). Datos sintéticos.
const withQuery = (node: ReactNode) => renderToStaticMarkup(<QueryClientProvider client={new QueryClient()}>{node}</QueryClientProvider>)

const wallet = (over: Partial<WalletSummary> = {}): WalletSummary => ({
  walletId: 'w1', name: 'Cartera fría', color: '#6366f1', kind: 'hardware', value: 1000, pct: 80, assetCount: 3,
  composition: {
    top: [{ asset: 'SINT', value: 700, pct: 70, pnlPct: 12, fiat: false }, { asset: 'PRUEBA', value: 300, pct: 30, pnlPct: -4, fiat: false }],
    others: { value: 0, pct: 0, count: 0 },
  },
  pnl: 120, pnlPct: 13.6, avgOpenedAt: Date.parse('2025-06-01T00:00:00Z'), ...over,
})
const props = { onSelect: () => {}, onDetalle: () => {}, colores: new Map([['SINT', '#8b5cf6']]), umbralOtras: 2 }

describe('WalletCards (#526)', () => {
  it('ancho proporcional al peso, tipo, %, P&L y activos con su peso y P&L en la moneda', () => {
    const html = withQuery(<WalletCards wallets={[wallet()]} selected={null} {...props} />)
    expect(html).toContain('flex:80 1 15rem')
    expect(html).toContain('Hardware · 80,0% de la cartera')
    expect(html).toContain('3 activos')
    expect(html).toContain('SINT: 70,0% de Cartera fría, P&amp;L +12,0%. Ver su detalle')
    // El color del activo es el de Distribución.
    expect(html).toContain('background-color:#8b5cf6')
  })

  it('la cabecera de la tarjeta filtra y anuncia su estado', () => {
    const html = withQuery(<WalletCards wallets={[wallet()]} selected="w1" {...props} />)
    expect(html).toContain('aria-pressed="true"')
    expect(html).toContain('Quitar el filtro de la tabla')
  })

  it('las wallets de menos del umbral van juntas en «Otras»', () => {
    const html = withQuery(<WalletCards wallets={[wallet(), wallet({ walletId: 'w2', name: 'Pequeña A', pct: 1 }), wallet({ walletId: 'w3', name: 'Pequeña B', pct: 1.5 })]} selected={null} {...props} />)
    expect(html).toContain('Otras (2)')
    expect(html).toContain('Pequeña A: 1,0% de la cartera. Filtrar la tabla por esta wallet')
  })
})

describe('WalletCards: el dinero no abre detalle (#526)', () => {
  it('una fila de EUR se muestra, sin botón de detalle', () => {
    const conEur = wallet({ composition: { top: [{ asset: 'EUR', value: 500, pct: 50, pnlPct: null, fiat: true }, { asset: 'SINT', value: 500, pct: 50, pnlPct: 1, fiat: false }], others: { value: 0, pct: 0, count: 0 } } })
    const html = withQuery(<WalletCards wallets={[conEur]} selected={null} {...props} />)
    expect(html).not.toContain('EUR: 50,0% de Cartera fría')
    expect(html).toContain('SINT: 50,0% de Cartera fría')
    expect(html).toContain('dinero')
  })
})
