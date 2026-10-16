import type { FifoLot, FiatBalance } from '../api/portfolio'
import { buildRows, type UnifiedRow } from './assetTable'
import { valuePortfolio } from './portfolioValuation'

// Secciones de la página Portfolio (#269): una por wallet con sus posiciones y
// el polvo de todas las wallets en un único bloque. El polvo se decide por
// posición (activo en una wallet): un activo grande en una wallet puede ser
// polvo en otra. Funciones puras; la página solo las pinta.

export interface WalletSection {
  walletId: string
  name: string
  color: string
  kind: string
  rows: UnifiedRow[]          // posiciones que no son polvo
  assetCount: number
}

export interface PortfolioSections {
  sections: WalletSection[]   // sin las wallets que solo tienen polvo
  dust: UnifiedRow[]          // polvo de todas las wallets, de mayor a menor valor
  dustValue: number
  total: number               // valor de toda la cartera (base del «% cartera»)
  unpriced: string[]          // activos sin precio en vivo
}

/** Posición de polvo: con precio y por debajo del umbral (sin precio nunca es polvo: no se sabe su valor). */
export function isDust(row: UnifiedRow, prices: Readonly<Record<string, number>>, threshold: number): boolean {
  if (row.kind === 'fiat') return row.value > 0 && row.value < threshold
  return (prices[row.asset] ?? 0) > 0 && row.value < threshold
}

/** Orden de las wallets: autocustodia primero, exchanges después; dentro, por orden de aparición. */
function walletOrder(lots: readonly FifoLot[], fiats: readonly FiatBalance[]): string[] {
  const order: string[] = []
  const add = (id: string) => { if (!order.includes(id)) order.push(id) }
  lots.filter(l => l.wallet_kind !== 'exchange').forEach(l => add(l.wallet_id))
  lots.filter(l => l.wallet_kind === 'exchange').forEach(l => add(l.wallet_id))
  fiats.forEach(f => add(f.wallet_id))
  return order
}

export function portfolioSections(
  lots: readonly FifoLot[],
  prices: Readonly<Record<string, number>>,
  fiats: readonly FiatBalance[],
  fiatPrice: number,
  dustThreshold: number,
): PortfolioSections {
  const sections: WalletSection[] = []
  const dust: UnifiedRow[] = []
  for (const walletId of walletOrder(lots, fiats)) {
    const wLots = lots.filter(l => l.wallet_id === walletId)
    const wFiats = fiats.filter(f => f.wallet_id === walletId)
    const rows = buildRows([...wLots], prices, [...wFiats], fiatPrice)
    const main = rows.filter(r => !isDust(r, prices, dustThreshold))
    dust.push(...rows.filter(r => isDust(r, prices, dustThreshold)))
    if (main.length === 0) continue
    const meta = wLots[0] ?? wFiats[0]
    sections.push({
      walletId,
      name: meta.wallet_name,
      color: meta.wallet_color,
      kind: wLots[0]?.wallet_kind ?? '',
      rows: main,
      assetCount: main.length,
    })
  }
  dust.sort((a, b) => b.value - a.value)
  const unpriced = [...new Set(lots.map(l => l.asset).filter(a => !((prices[a] ?? 0) > 0)))].sort()
  return {
    sections,
    dust,
    dustValue: dust.reduce((s, r) => s + r.value, 0),
    total: valuePortfolio(lots, prices, fiats, fiatPrice).totalValue,
    unpriced,
  }
}
