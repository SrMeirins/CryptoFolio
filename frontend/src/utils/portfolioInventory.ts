import type { FifoLot, FiatBalance, LockedAmount } from '../api/portfolio'

// Inventario de Portfolio (#270): dónde está la cartera y en qué custodia.
// Son datos que el Dashboard no muestra (allí, valor y rendimiento). Funciones
// puras sobre lotes y saldos ya convertidos a la moneda de visualización.

export interface WalletSummary {
  walletId: string
  name: string
  color: string
  kind: string
  value: number
  pct: number          // % del total de la cartera
  assetCount: number   // activos con cantidad en la wallet
}

export interface Inventory {
  total: number
  custody: { exchange: number; self: number; exchangePct: number }
  positions: { assets: number; wallets: number; top: { asset: string; pct: number } | null }
  locked: { value: number; assets: number }
  wallets: WalletSummary[]   // de mayor a menor valor
}

const isExchange = (kind: string) => kind === 'exchange'

export function portfolioInventory(
  lots: readonly FifoLot[],
  prices: Readonly<Record<string, number>>,
  fiats: readonly FiatBalance[],
  fiatPrice: number,
  locked: readonly LockedAmount[],
): Inventory {
  const wallets = new Map<string, WalletSummary & { assets: Set<string> }>()
  const byAsset = new Map<string, number>()
  const wallet = (id: string, name: string, color: string, kind: string) => {
    let w = wallets.get(id)
    if (!w) { w = { walletId: id, name, color, kind, value: 0, pct: 0, assetCount: 0, assets: new Set() }; wallets.set(id, w) }
    return w
  }

  for (const l of lots) {
    const value = parseFloat(l.quantity) * (prices[l.asset] ?? 0)
    const w = wallet(l.wallet_id, l.wallet_name, l.wallet_color, l.wallet_kind)
    w.value += value
    w.assets.add(l.asset)
    byAsset.set(l.asset, (byAsset.get(l.asset) ?? 0) + value)
  }
  for (const f of fiats) {
    const value = parseFloat(f.balance) * fiatPrice
    const w = wallet(f.wallet_id, f.wallet_name, f.wallet_color, f.wallet_kind)
    w.value += value
    if (parseFloat(f.balance) > 0) w.assets.add(f.asset)
    byAsset.set(f.asset, (byAsset.get(f.asset) ?? 0) + value)
  }

  const list = [...wallets.values()]
  const total = list.reduce((s, w) => s + w.value, 0)
  const exchange = list.filter(w => isExchange(w.kind)).reduce((s, w) => s + w.value, 0)
  const top = [...byAsset].sort((a, b) => b[1] - a[1])[0]
  const lockedAssets = new Set<string>()
  const lockedValue = locked.reduce((s, l) => {
    const qty = parseFloat(l.locked_amount)
    if (!(qty > 0)) return s
    lockedAssets.add(l.asset)
    return s + qty * (prices[l.asset] ?? 0)
  }, 0)

  return {
    total,
    custody: { exchange, self: total - exchange, exchangePct: total > 0 ? (exchange / total) * 100 : 0 },
    positions: {
      assets: byAsset.size,
      wallets: list.length,
      top: top && total > 0 && top[1] > 0 ? { asset: top[0], pct: (top[1] / total) * 100 } : null,
    },
    locked: { value: lockedValue, assets: lockedAssets.size },
    wallets: list
      .map(({ assets, ...w }) => ({ ...w, assetCount: assets.size, pct: total > 0 ? (w.value / total) * 100 : 0 }))
      .sort((a, b) => b.value - a.value),
  }
}
