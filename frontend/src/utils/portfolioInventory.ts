import type { FifoLot, FiatBalance, LockedAmount } from '../api/portfolio'

// Inventario de Portfolio (#270): dónde está la cartera y en qué custodia.
// Son datos que el Dashboard no muestra (allí, valor y rendimiento). Funciones
// puras sobre lotes y saldos ya convertidos a la moneda de visualización.

/** Segmento de la barra de composición de una wallet (#283). */
export interface CompositionPart { asset: string; value: number; pct: number }

export interface WalletSummary {
  walletId: string
  name: string
  color: string
  kind: string
  value: number
  pct: number          // % del total de la cartera
  assetCount: number   // activos sin polvo (o todos, si la wallet solo tiene polvo)
  /** Activos principales (máx. 4) y el resto en «otros», que incluye el polvo; suman `value`. */
  composition: { top: CompositionPart[]; others: { value: number; pct: number; count: number } }
  /** P&L no realizado de las posiciones cripto con precio; null si no hay coste. */
  pnl: number | null
  pnlPct: number | null
  /** Fecha media de apertura ponderada por coste (ms); null sin lotes. */
  avgOpenedAt: number | null
}

export interface Inventory {
  total: number
  custody: { exchange: number; self: number; exchangePct: number }
  positions: { assets: number; wallets: number; top: { asset: string; pct: number } | null }
  locked: { value: number; assets: number }
  wallets: WalletSummary[]   // de mayor a menor valor
  /** Fecha media de apertura de toda la cartera, ponderada por coste (ms); null sin lotes. */
  avgOpenedAt: number | null
}

const TOP_PARTS = 4

/** Media de fechas ponderada por coste; si no hay coste (airdrops), por igual. */
function weightedDate(items: ReadonlyArray<{ at: number; weight: number }>): number | null {
  if (items.length === 0) return null
  const w = items.reduce((s, i) => s + i.weight, 0)
  return w > 0
    ? items.reduce((s, i) => s + i.at * i.weight, 0) / w
    : items.reduce((s, i) => s + i.at, 0) / items.length
}

/** Composición de una wallet: activos sin polvo de mayor a menor y el resto en «otros». */
export function walletComposition(values: ReadonlyMap<string, number>, total: number, dustThreshold: number): WalletSummary['composition'] & { assetCount: number } {
  const all = [...values].map(([asset, value]) => ({ asset, value })).sort((a, b) => b.value - a.value)
  const solid = all.filter(a => a.value >= dustThreshold)
  // Si la wallet solo tiene polvo, se muestra tal cual: es todo lo que hay.
  const shown = solid.length > 0 ? solid : all
  const pct = (v: number) => (total > 0 ? (v / total) * 100 : 0)
  const top = shown.slice(0, TOP_PARTS).filter(a => a.value > 0).map(a => ({ ...a, pct: pct(a.value) }))
  const othersValue = total - top.reduce((s, a) => s + a.value, 0)
  return {
    top,
    others: { value: Math.max(0, othersValue), pct: pct(Math.max(0, othersValue)), count: Math.max(0, shown.length - top.length) },
    assetCount: shown.length,
  }
}

const isExchange = (kind: string) => kind === 'exchange'

export function portfolioInventory(
  lots: readonly FifoLot[],
  prices: Readonly<Record<string, number>>,
  fiats: readonly FiatBalance[],
  fiatPrice: number,
  locked: readonly LockedAmount[],
  dustThreshold = 0,
): Inventory {
  interface Acc { walletId: string; name: string; color: string; kind: string; value: number; assets: Map<string, number>; cost: number; pricedValue: number; dates: { at: number; weight: number }[] }
  const wallets = new Map<string, Acc>()
  const byAsset = new Map<string, number>()
  const allDates: { at: number; weight: number }[] = []
  const wallet = (id: string, name: string, color: string, kind: string) => {
    let w = wallets.get(id)
    if (!w) { w = { walletId: id, name, color, kind, value: 0, assets: new Map(), cost: 0, pricedValue: 0, dates: [] }; wallets.set(id, w) }
    return w
  }

  for (const l of lots) {
    const price = prices[l.asset] ?? 0
    const value = parseFloat(l.quantity) * price
    const cost = parseFloat(l.cost_basis_eur) || 0
    const w = wallet(l.wallet_id, l.wallet_name, l.wallet_color, l.wallet_kind)
    w.value += value
    w.assets.set(l.asset, (w.assets.get(l.asset) ?? 0) + value)
    if (price > 0) { w.cost += cost; w.pricedValue += value }
    const at = l.avg_opened_at ? Date.parse(l.avg_opened_at) : NaN
    if (Number.isFinite(at)) { w.dates.push({ at, weight: cost }); allDates.push({ at, weight: cost }) }
    byAsset.set(l.asset, (byAsset.get(l.asset) ?? 0) + value)
  }
  for (const f of fiats) {
    const value = parseFloat(f.balance) * fiatPrice
    const w = wallet(f.wallet_id, f.wallet_name, f.wallet_color, f.wallet_kind)
    w.value += value
    if (parseFloat(f.balance) > 0) w.assets.set(f.asset, (w.assets.get(f.asset) ?? 0) + value)
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
      .map(({ assets, cost, pricedValue, dates, ...w }) => {
        const { assetCount, ...composition } = walletComposition(assets, w.value, dustThreshold)
        const pnl = cost > 0 ? pricedValue - cost : null
        return {
          ...w, assetCount, composition,
          pct: total > 0 ? (w.value / total) * 100 : 0,
          pnl, pnlPct: pnl !== null ? (pnl / cost) * 100 : null,
          avgOpenedAt: weightedDate(dates),
        }
      })
      .sort((a, b) => b.value - a.value),
    avgOpenedAt: weightedDate(allDates),
  }
}

const hueGap = (a: number, b: number) => { const d = Math.abs(a - b) % 360; return Math.min(d, 360 - d) }

/**
 * Tonos para los segmentos de una barra (#283): el propio de cada activo,
 * desplazado si queda a menos de `minGap` grados de uno ya usado, para que
 * dos activos de la misma wallet no compartan color.
 */
export function distinctHues(baseHues: readonly number[], minGap = 45): number[] {
  const used: number[] = []
  for (const base of baseHues) {
    let h = ((base % 360) + 360) % 360
    for (let i = 0; i < 12 && used.some(u => hueGap(u, h) < minGap); i++) h = (h + 53) % 360
    used.push(h)
  }
  return used
}
