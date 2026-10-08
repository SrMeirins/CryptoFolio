import { type FifoLot, type FiatBalance } from '../api/portfolio'

export interface WalletBreakdown {
  wallet_id:    string
  wallet_name:  string
  wallet_color: string
  wallet_kind:  string
  quantity:     number
  costBasis:    number
}

export interface CryptoRow {
  kind:           'crypto'
  asset:          string
  value:          number
  totalQuantity:  number
  totalCostBasis: number
  avgPrice:       number
  wallets:        WalletBreakdown[]
}

export interface FiatRow {
  kind:    'fiat'
  asset:   string
  value:   number
  wallets: { wallet_id: string; wallet_name: string; wallet_color: string }[]
}

export type UnifiedRow = CryptoRow | FiatRow

/**
 * Agrupa lotes FIFO por activo, sumando cantidad y coste base — sin
 * desglose por wallet ni fiat (para eso usa `buildRows`). Es la base de la
 * valoración común (`utils/portfolioValuation.ts`) y del ranking de TopMovers.
 */
export function aggregateLotsByAsset(lots: FifoLot[]): Map<string, { qty: number; cost: number }> {
  const byAsset = new Map<string, { qty: number; cost: number }>()
  for (const lot of lots) {
    const prev = byAsset.get(lot.asset) ?? { qty: 0, cost: 0 }
    byAsset.set(lot.asset, {
      qty:  prev.qty  + parseFloat(lot.quantity),
      cost: prev.cost + parseFloat(lot.cost_basis_eur),
    })
  }
  return byAsset
}

/** Agrupa lotes FIFO y saldos fiat en filas unificadas por activo, ordenadas por valor descendente. */
export function buildRows(
  lots: FifoLot[],
  prices: Record<string, number>,
  fiatBalances: FiatBalance[]
): UnifiedRow[] {
  const cryptoMap = new Map<string, CryptoRow>()

  for (const lot of lots) {
    const qty   = parseFloat(lot.quantity)
    const cost  = parseFloat(lot.cost_basis_eur)
    const price = prices[lot.asset] ?? 0

    if (!cryptoMap.has(lot.asset)) {
      cryptoMap.set(lot.asset, {
        kind: 'crypto', asset: lot.asset,
        value: 0, totalQuantity: 0, totalCostBasis: 0,
        avgPrice: parseFloat(lot.avg_price_eur),
        wallets: [],
      })
    }
    const row = cryptoMap.get(lot.asset)!
    row.totalQuantity  += qty
    row.totalCostBasis += cost
    row.value           = row.totalQuantity * price

    // Acumular por wallet
    const existing = row.wallets.find(w => w.wallet_id === lot.wallet_id)
    if (existing) {
      existing.quantity += qty
      existing.costBasis += cost
    } else {
      row.wallets.push({
        wallet_id:    lot.wallet_id,
        wallet_name:  lot.wallet_name,
        wallet_color: lot.wallet_color,
        wallet_kind:  lot.wallet_kind,
        quantity:     qty,
        costBasis:    cost,
      })
    }
  }

  const fiatMap = new Map<string, FiatRow>()
  for (const b of fiatBalances) {
    const bal = parseFloat(b.balance)
    if (!fiatMap.has(b.asset)) {
      fiatMap.set(b.asset, { kind: 'fiat', asset: b.asset, value: 0, wallets: [] })
    }
    const row = fiatMap.get(b.asset)!
    row.value += bal
    if (!row.wallets.find(w => w.wallet_id === b.wallet_id)) {
      row.wallets.push({ wallet_id: b.wallet_id, wallet_name: b.wallet_name, wallet_color: b.wallet_color })
    }
  }

  return [
    ...cryptoMap.values(),
    ...fiatMap.values(),
  ].sort((a, b) => b.value - a.value)
}

export type SortKey = 'asset' | 'quantity' | 'price' | 'value' | 'cost' | 'pnl' | 'pnlpct' | 'weight' | 'breakeven'
export type SortDir = 'asc' | 'desc'

/** Siguiente orden al pulsar una columna: misma columna invierte la dirección; otra nueva empieza en descendente. */
export function nextSort(clicked: SortKey, key: SortKey, dir: SortDir): { key: SortKey; dir: SortDir } {
  if (clicked === key) return { key, dir: dir === 'asc' ? 'desc' : 'asc' }
  return { key: clicked, dir: 'desc' }
}

export function sortRows(rows: UnifiedRow[], key: SortKey, dir: SortDir, prices: Record<string, number>, total: number): UnifiedRow[] {
  return [...rows].sort((a, b) => {
    let va = 0, vb = 0
    if (key === 'asset') {
      const cmp = a.asset.localeCompare(b.asset)
      return dir === 'asc' ? cmp : -cmp
    }
    if (key === 'quantity') {
      va = a.kind === 'crypto' ? a.totalQuantity : 0
      vb = b.kind === 'crypto' ? b.totalQuantity : 0
    } else if (key === 'price') {
      va = a.kind === 'crypto' ? (prices[a.asset] ?? 0) : 1
      vb = b.kind === 'crypto' ? (prices[b.asset] ?? 0) : 1
    } else if (key === 'value') {
      va = a.value; vb = b.value
    } else if (key === 'cost') {
      va = a.kind === 'crypto' ? a.totalCostBasis : 0
      vb = b.kind === 'crypto' ? b.totalCostBasis : 0
    } else if (key === 'pnl') {
      const priceA = a.kind === 'crypto' ? (prices[a.asset] ?? 0) : 0
      const priceB = b.kind === 'crypto' ? (prices[b.asset] ?? 0) : 0
      va = priceA > 0 && a.kind === 'crypto' ? a.value - a.totalCostBasis : -Infinity
      vb = priceB > 0 && b.kind === 'crypto' ? b.value - b.totalCostBasis : -Infinity
    } else if (key === 'pnlpct') {
      const priceA = a.kind === 'crypto' ? (prices[a.asset] ?? 0) : 0
      const priceB = b.kind === 'crypto' ? (prices[b.asset] ?? 0) : 0
      va = priceA > 0 && a.kind === 'crypto' && a.totalCostBasis > 0 ? ((a.value - a.totalCostBasis) / a.totalCostBasis) * 100 : -Infinity
      vb = priceB > 0 && b.kind === 'crypto' && b.totalCostBasis > 0 ? ((b.value - b.totalCostBasis) / b.totalCostBasis) * 100 : -Infinity
    } else if (key === 'weight') {
      va = total > 0 ? (a.value / total) * 100 : 0
      vb = total > 0 ? (b.value / total) * 100 : 0
    } else if (key === 'breakeven') {
      va = a.kind === 'crypto' && a.totalQuantity > 0 ? a.totalCostBasis / a.totalQuantity : 0
      vb = b.kind === 'crypto' && b.totalQuantity > 0 ? b.totalCostBasis / b.totalQuantity : 0
    }
    return dir === 'asc' ? va - vb : vb - va
  })
}

/** Nombre corto para chip de wallet: Exchange → solo la sub-cuenta ("Binance Spot" → "Spot"); cold wallet → nombre completo. */
export function walletShortName(name: string, kind: string): string {
  if (kind === 'exchange') {
    const parts = name.split(' ')
    return parts.length > 1 ? parts.slice(1).join(' ') : name
  }
  return name
}
