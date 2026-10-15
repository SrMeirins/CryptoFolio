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
}

export const MAX_ITEMS = 8
export const CONCENTRATION_THRESHOLD = 0.4

function withOthers(items: AllocationItem[], total: number, max: number): AllocationItem[] {
  if (items.length <= max + 1) return items
  const shown = items.slice(0, max)
  const rest = items.slice(max)
  const value = rest.reduce((s, i) => s + i.value, 0)
  return [...shown, {
    key: '__otros', label: 'Otros', value, pct: (value / total) * 100, color: NEUTRAL_COLOR, kind: 'other', change24h: null,
    members: rest.map(i => ({ label: i.label, value: i.value, pct: i.pct })),
  }]
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
      members: [],
    }
  })
  return withOthers(items, total, max)
}

/** Reparto por wallet: valor de los lotes a precio actual más el efectivo de cada wallet, con su color. */
export function allocationByWallet(
  lots: readonly FifoLot[],
  fiat: readonly FiatBalance[],
  prices: Readonly<Record<string, number>>,
  fiatPrice = 1,
  max = MAX_ITEMS,
  minValue = 0,
): AllocationItem[] {
  const wallets = new Map<string, { label: string; color: string; value: number }>()
  const add = (id: string, label: string, color: string, value: number) => {
    const w = wallets.get(id) ?? { label, color, value: 0 }
    w.value += value
    wallets.set(id, w)
  }
  for (const l of lots) {
    const price = prices[l.asset]
    if (price && price > 0) add(l.wallet_id, l.wallet_name, l.wallet_color, parseFloat(l.quantity) * price)
  }
  for (const f of fiat) add(f.wallet_id, f.wallet_name, f.wallet_color, parseFloat(f.balance) * fiatPrice)
  // Las wallets con un valor por debajo de `minValue` (polvo) no se muestran.
  const list = [...wallets.entries()].filter(([, w]) => w.value > 0 && w.value >= minValue).sort((a, b) => b[1].value - a[1].value)
  const total = list.reduce((s, [, w]) => s + w.value, 0)
  if (total <= 0) return []
  const items: AllocationItem[] = list.map(([id, w]) => ({
    key: id, label: w.label, value: w.value, pct: (w.value / total) * 100, color: w.color || NEUTRAL_COLOR,
    kind: 'wallet', change24h: null, members: [],
  }))
  return withOthers(items, total, max)
}

/** Elemento que concentra más del umbral de la cartera (el mayor), o null. */
export function concentration(items: readonly AllocationItem[], threshold = CONCENTRATION_THRESHOLD): AllocationItem | null {
  const top = items.filter(i => i.kind !== 'other' && i.kind !== 'fiat').sort((a, b) => b.pct - a.pct)[0]
  return top && top.pct / 100 >= threshold ? top : null
}
