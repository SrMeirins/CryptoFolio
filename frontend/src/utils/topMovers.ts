import type { AssetValuation } from './portfolioValuation'

// Ranking de mejores y peores activos del Dashboard (#153).

// Activos con valor inferior a este umbral se consideran polvo: la tabla de
// activos los agrupa aparte y el ranking los excluye.
export const DUST_THRESHOLD_EUR = 1

export type MoversMode = '24h' | 'total'

export interface MoverItem {
  asset: string
  pct: number
  value: number
  rank: number
}

const MAX_PER_LIST = 3

// - total: rentabilidad desde la compra, precio actual frente al precio medio
//   (coste / cantidad). Requiere coste > 0.
// - 24h: variación frente al precio de hace 24h (`open24`). Los activos sin
//   ese precio se excluyen.
// Solo cripto con precio actual y valor ≥ DUST_THRESHOLD_EUR. Cada activo
// aparece como mucho en una lista: con menos de seis, se reparten por mitades
// (el sobrante va a Mejores).
export function rankMovers(
  assets: readonly AssetValuation[],
  open24: Readonly<Record<string, number>>,
  mode: MoversMode,
): { top: MoverItem[]; bottom: MoverItem[] } {
  const items: Omit<MoverItem, 'rank'>[] = []

  for (const a of assets) {
    if (a.kind !== 'crypto' || a.price === null || a.value < DUST_THRESHOLD_EUR) continue

    let reference: number | undefined
    if (mode === 'total') {
      if (!(a.cost > 0) || !(a.quantity > 0)) continue
      reference = a.cost / a.quantity
    } else {
      reference = open24[a.asset]
      if (reference === undefined || !(reference > 0)) continue
    }

    items.push({ asset: a.asset, pct: ((a.price - reference) / reference) * 100, value: a.value })
  }

  const sorted = items.sort((x, y) => y.pct - x.pct)
  const bottomCount = Math.min(MAX_PER_LIST, Math.floor(sorted.length / 2))
  const topCount = Math.min(MAX_PER_LIST, sorted.length - bottomCount)

  return {
    top: sorted.slice(0, topCount).map((item, i) => ({ ...item, rank: i + 1 })),
    bottom: sorted.slice(sorted.length - bottomCount).reverse().map((item, i) => ({ ...item, rank: i + 1 })),
  }
}
