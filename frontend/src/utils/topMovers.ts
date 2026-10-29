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
  price: number       // precio actual
  reference: number   // precio de hace 24 h o precio medio de compra
  impact: number      // efecto en la cartera: cantidad × (precio − referencia)
}

export type MoverData = Omit<MoverItem, 'rank'>

const MAX_PER_LIST = 3

// - total: rentabilidad desde la compra, precio actual frente al precio medio
//   (coste / cantidad). Requiere coste > 0.
// - 24h: variación frente al precio de hace 24h (`open24`). Los activos sin
//   ese precio se excluyen.
// Solo cripto con precio actual y valor ≥ dustThreshold (1 € expresado en la
// moneda de visualización). Cada activo
// aparece como mucho en una lista: con menos de seis, se reparten por mitades
// (el sobrante va a Mejores).
export function rankMovers(
  assets: readonly AssetValuation[],
  open24: Readonly<Record<string, number>>,
  mode: MoversMode,
  dustThreshold = DUST_THRESHOLD_EUR,
): { top: MoverItem[]; bottom: MoverItem[] } {
  const sorted = moverData(assets, open24, mode, dustThreshold)
  const bottomCount = Math.min(MAX_PER_LIST, Math.floor(sorted.length / 2))
  const topCount = Math.min(MAX_PER_LIST, sorted.length - bottomCount)

  return {
    top: sorted.slice(0, topCount).map((item, i) => ({ ...item, rank: i + 1 })),
    bottom: sorted.slice(sorted.length - bottomCount).reverse().map((item, i) => ({ ...item, rank: i + 1 })),
  }
}

/** Todos los activos comparables con su variación e impacto, de mayor a menor variación (#233). */
export function moverData(
  assets: readonly AssetValuation[],
  open24: Readonly<Record<string, number>>,
  mode: MoversMode,
  dustThreshold = DUST_THRESHOLD_EUR,
): MoverData[] {
  const items: MoverData[] = []

  for (const a of assets) {
    if (a.kind !== 'crypto' || a.price === null || a.value < dustThreshold) continue

    let reference: number | undefined
    if (mode === 'total') {
      if (!(a.cost > 0) || !(a.quantity > 0)) continue
      reference = a.cost / a.quantity
    } else {
      reference = open24[a.asset]
      if (reference === undefined || !(reference > 0)) continue
    }

    items.push({
      asset: a.asset, pct: ((a.price - reference) / reference) * 100, value: a.value,
      price: a.price, reference, impact: a.quantity * (a.price - reference),
    })
  }
  return items.sort((x, y) => y.pct - x.pct)
}

/**
 * Etiquetas de las dos columnas del ranking según lo que contienen (#233): la
 * primera es «Suben más» si todos suben, «Caen menos» si todos bajan y «Mejor
 * evolución» si hay de los dos (y su simétrica en la segunda). Si todo el
 * mercado va en un sentido se añade un aviso.
 */
export function rankLabels(
  items: readonly MoverData[],
  top: readonly MoverData[] = items.slice(0, 3),
  bottom: readonly MoverData[] = items.slice(-3),
): { first: string; second: string; notice: string | null } {
  const label = (list: readonly MoverData[], allUp: string, allDown: string, mixed: string) =>
    list.length && list.every(i => i.pct > 0) ? allUp : list.length && list.every(i => i.pct < 0) ? allDown : mixed
  const up = items.filter(i => i.pct > 0).length
  const down = items.filter(i => i.pct < 0).length
  const n = items.length
  return {
    first: label(top, 'Suben más', 'Caen menos', 'Mejor evolución'),
    second: label(bottom, 'Suben menos', 'Bajan más', 'Peor evolución'),
    notice: n > 0 && up === 0 ? `Mercado en rojo: ${down} de ${n} activos bajan`
      : n > 0 && down === 0 ? `Mercado en verde: ${up} de ${n} activos suben` : null,
  }
}

export interface HeatCell {
  asset: string            // 'Otros' para el grupo de posiciones pequeñas
  value: number
  pct: number              // en «Otros», media ponderada por valor
  impact: number
  price: number | null     // null en «Otros»
  members: string[]        // activos agrupados en «Otros»
}

/** Celdas del mapa de calor: activos de mayor a menor valor; los de menos del `minShare` se agrupan en «Otros». */
export function heatmapCells(items: readonly MoverData[], minShare = 0.01): HeatCell[] {
  const total = items.reduce((s, i) => s + i.value, 0)
  if (total <= 0) return []
  const cells: HeatCell[] = []
  const small: MoverData[] = []
  for (const i of [...items].sort((a, b) => b.value - a.value)) {
    if (i.value / total < minShare) small.push(i)
    else cells.push({ asset: i.asset, value: i.value, pct: i.pct, impact: i.impact, price: i.price, members: [] })
  }
  if (small.length === 1) {
    const i = small[0]
    cells.push({ asset: i.asset, value: i.value, pct: i.pct, impact: i.impact, price: i.price, members: [] })
  } else if (small.length > 1) {
    const value = small.reduce((s, i) => s + i.value, 0)
    cells.push({
      asset: 'Otros', value, price: null, members: small.map(i => i.asset),
      pct: small.reduce((s, i) => s + i.pct * i.value, 0) / value,
      impact: small.reduce((s, i) => s + i.impact, 0),
    })
  }
  return cells
}

/** Tope de la escala de color: a partir de esta variación el color ya es el más intenso. */
export const HEAT_CAP: Record<MoversMode, number> = { '24h': 5, total: 50 }

/**
 * Intensidad del color de una celda (0–1): 0 sin variación; de 0,12 a 1 con
 * curva de raíz (los movimientos pequeños ya se distinguen) y saturada a
 * partir del tope. El CSS la mezcla del fondo neutro al tono intenso del tema.
 */
export function heatLevel(pct: number, cap: number): number {
  if (pct === 0 || cap <= 0) return 0
  return 0.12 + 0.88 * Math.sqrt(Math.min(1, Math.abs(pct) / cap))
}

/** Fondo CSS de una celda: del gris neutro al verde o rojo intenso del tema. */
export function heatBackground(pct: number, cap: number): string {
  const level = heatLevel(pct, cap).toFixed(3)
  const tone = pct >= 0 ? 'var(--cf-heat-up)' : 'var(--cf-heat-down)'
  return `color-mix(in srgb, ${tone} calc(${level} * var(--cf-heat-max) * 1%), var(--cf-bg-tertiary))`
}

/**
 * Variables del marco de intensidad del calendario (#412): `--card` con el
 * color del signo y `--heat` con el nivel de la escala (0 a 1). El borde y el
 * brillo de la tarjeta crecen con el nivel (clases heat-frame y heat-body).
 */
export function heatVars(pnl: number, cap: number): Record<'--card' | '--heat', string> {
  return {
    '--card': pnl > 0 ? 'var(--cf-positive)' : pnl < 0 ? 'var(--cf-negative)' : 'var(--cf-fg-subtle)',
    '--heat': heatLevel(pnl, cap).toFixed(3),
  }
}

/** Resumen de la vista Total: posiciones en ganancia y en pérdida, mejor y peor. */
export function moversSummary(items: readonly MoverData[]): { gains: number; losses: number; best: MoverData | null; worst: MoverData | null } {
  return {
    gains: items.filter(i => i.pct > 0).length,
    losses: items.filter(i => i.pct < 0).length,
    best: items.length && items[0].pct > 0 ? items[0] : null,
    worst: items.length && items[items.length - 1].pct < 0 ? items[items.length - 1] : null,
  }
}
