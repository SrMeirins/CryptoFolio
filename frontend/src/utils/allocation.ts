import type { FifoLot, FiatBalance } from '../api/portfolio'
import type { AssetValuation } from './portfolioValuation'

// Distribución de la cartera del Dashboard (#235): reparto por activo o por
// wallet, con un máximo de elementos y el resto agrupado en «Otros», y aviso
// de concentración. Funciones puras.

/** Paleta categórica sin rojos ni verdes (no se confunden con ganancia/pérdida); ≥ 3:1 sobre la tarjeta en ambos temas. */
export const ALLOCATION_PALETTE = ['#8b5cf6', '#3b82f6', '#d97706', '#db2777', '#0891b2', '#ea580c', '#c026d3', '#a16207'] as const
/** «Otros» y el efectivo: gris pizarra (el efectivo, con trama). */
export const NEUTRAL_COLOR = '#64748b'

export type AllocationMode = 'asset' | 'wallet'

export interface AllocationItem {
  key: string
  label: string
  value: number
  pct: number
  color: string
  kind: 'crypto' | 'fiat' | 'wallet' | 'other'
  change24h: number | null          // variación 24 h (solo activos cripto con precio de hace 24 h)
  members: Array<{ label: string; value: number; pct: number }>  // contenido de «Otros»
  /** Por wallet (#506): su composición por activo, los 5 mayores y «Otros», con los colores de la vista por activo. */
  breakdown: AllocationPart[]
}

export interface AllocationPart { key: string; label: string; value: number; pct: number; color: string }

/** Activos que se muestran en el desglose de cada wallet; el resto, en «Otros». */
export const MAX_BREAKDOWN = 5

export const MAX_ITEMS = 8
export const CONCENTRATION_THRESHOLD = 0.4

/**
 * Los `max` mayores y el resto en «Otros». `forceRest` manda a «Otros» los
 * elementos indicados aunque quepan (wallets con valor de polvo, #506): así
 * nunca se pierde valor y el total coincide con el de la vista por activo.
 */
function withOthers(items: AllocationItem[], total: number, max: number, forceRest: (i: AllocationItem) => boolean = () => false): AllocationItem[] {
  const candidates = items.filter(i => !forceRest(i))
  const forced = items.filter(forceRest)
  if (forced.length === 0 && items.length <= max + 1) return items
  const shown = candidates.slice(0, max)
  const rest = [...candidates.slice(max), ...forced].sort((a, b) => b.value - a.value)
  if (rest.length === 0) return shown
  const value = rest.reduce((s, i) => s + i.value, 0)
  return [...shown, {
    key: '__otros', label: 'Otros', value, pct: (value / total) * 100, color: NEUTRAL_COLOR, kind: 'other', change24h: null,
    members: rest.map(i => ({ label: i.label, value: i.value, pct: i.pct })), breakdown: [],
  }]
}

/** Color de cada activo en la vista por activo (mismo orden de valor), para reutilizarlo por wallet. */
export function assetColors(assets: readonly AssetValuation[]): Map<string, string> {
  const colors = new Map<string, string>()
  let colorIndex = 0
  for (const a of [...assets].filter(x => x.value > 0).sort((x, y) => y.value - x.value)) {
    colors.set(a.asset, a.kind === 'fiat' ? NEUTRAL_COLOR : ALLOCATION_PALETTE[colorIndex++ % ALLOCATION_PALETTE.length])
  }
  return colors
}

/** Reparto por activo: de mayor a menor valor, con variación 24 h; el efectivo, en gris. */
export function allocationByAsset(
  assets: readonly AssetValuation[],
  open24: Readonly<Record<string, number>>,
  max = MAX_ITEMS,
): AllocationItem[] {
  const valued = assets.filter(a => a.value > 0).sort((a, b) => b.value - a.value)
  const total = valued.reduce((s, a) => s + a.value, 0)
  if (total <= 0) return []
  let colorIndex = 0
  const items: AllocationItem[] = valued.map(a => {
    const fiat = a.kind === 'fiat'
    const ref = open24[a.asset]
    return {
      key: a.asset, label: a.asset, value: a.value, pct: (a.value / total) * 100,
      color: fiat ? NEUTRAL_COLOR : ALLOCATION_PALETTE[colorIndex++ % ALLOCATION_PALETTE.length],
      kind: fiat ? 'fiat' : 'crypto',
      change24h: !fiat && a.price !== null && ref && ref > 0 ? ((a.price - ref) / ref) * 100 : null,
      members: [], breakdown: [],
    }
  })
  return withOthers(items, total, max)
}

/**
 * Reparto por wallet: valor de los lotes a precio actual más el efectivo de
 * cada wallet, con su color y su composición por activo (#506). Las mismas
 * reglas que `valuePortfolio`, así que el total coincide con la vista por
 * activo; las wallets por debajo de `minValue` (polvo) van a «Otros», no se
 * quitan.
 */
export function allocationByWallet(
  lots: readonly FifoLot[],
  fiat: readonly FiatBalance[],
  prices: Readonly<Record<string, number>>,
  fiatPrice = 1,
  max = MAX_ITEMS,
  minValue = 0,
  colors: ReadonlyMap<string, string> = new Map(),
): AllocationItem[] {
  const wallets = new Map<string, { label: string; color: string; value: number; byAsset: Map<string, number> }>()
  const add = (id: string, label: string, color: string, asset: string, value: number) => {
    const w = wallets.get(id) ?? { label, color, value: 0, byAsset: new Map<string, number>() }
    w.value += value
    w.byAsset.set(asset, (w.byAsset.get(asset) ?? 0) + value)
    wallets.set(id, w)
  }
  for (const l of lots) {
    const price = prices[l.asset]
    if (price && price > 0) add(l.wallet_id, l.wallet_name, l.wallet_color, l.asset, parseFloat(l.quantity) * price)
  }
  for (const f of fiat) add(f.wallet_id, f.wallet_name, f.wallet_color, f.asset, parseFloat(f.balance) * fiatPrice)
  const list = [...wallets.entries()].filter(([, w]) => w.value > 0).sort((a, b) => b[1].value - a[1].value)
  const total = list.reduce((s, [, w]) => s + w.value, 0)
  if (total <= 0) return []
  const items: AllocationItem[] = list.map(([id, w]) => ({
    key: id, label: w.label, value: w.value, pct: (w.value / total) * 100, color: w.color || NEUTRAL_COLOR,
    kind: 'wallet', change24h: null, members: [], breakdown: walletBreakdown(w.byAsset, w.value, colors),
  }))
  return withOthers(items, total, max, i => i.value < minValue)
}

/** Composición de una wallet: los activos mayores y el resto en «Otros»; los % suman 100 sobre la wallet. */
function walletBreakdown(byAsset: ReadonlyMap<string, number>, walletValue: number, colors: ReadonlyMap<string, string>): AllocationPart[] {
  const parts = [...byAsset.entries()].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1])
  const pct = (v: number) => (walletValue > 0 ? (v / walletValue) * 100 : 0)
  const shown = parts.length <= MAX_BREAKDOWN + 1 ? parts : parts.slice(0, MAX_BREAKDOWN)
  const out = shown.map(([asset, v]) => ({ key: asset, label: asset, value: v, pct: pct(v), color: colors.get(asset) ?? NEUTRAL_COLOR }))
  const rest = parts.slice(shown.length).reduce((s, [, v]) => s + v, 0)
  if (rest > 0) out.push({ key: '__otros', label: 'Otros', value: rest, pct: pct(rest), color: NEUTRAL_COLOR })
  return out
}

/** Elemento que concentra más del umbral de la cartera (el mayor), o null. */
export function concentration(items: readonly AllocationItem[], threshold = CONCENTRATION_THRESHOLD): AllocationItem | null {
  const top = items.filter(i => i.kind !== 'other' && i.kind !== 'fiat').sort((a, b) => b.pct - a.pct)[0]
  return top && top.pct / 100 >= threshold ? top : null
}
