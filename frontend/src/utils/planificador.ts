// Planificador de fin de año (#307): mejor venta parcial respetando el FIFO
// global por activo (#476: salen primero las unidades compradas antes, estén en
// la wallet que estén) y sugerencias de pérdidas a realizar y de ganancias que
// caben en el colchón. Funciones puras; los precios llegan en EUR del feed en vivo.

export interface PlanLot {
  asset: string
  walletId: string
  walletName: string
  walletColor: string
  walletKind: string
  openedAt: string
  quantity: number
  /** Coste unitario de adquisición en EUR. */
  unitCost: number
}

export interface Venta { quantity: number; pnl: number }

/**
 * Mayor pérdida realizable vendiendo desde el lote más antiguo (FIFO). Dentro
 * de un lote el resultado varía de forma lineal, así que el extremo está en
 * un final de lote. null si ninguna venta da pérdida.
 */
export function mejorPerdida(lots: readonly PlanLot[], price: number): Venta | null {
  let qty = 0, pnl = 0
  let best: Venta | null = null
  for (const l of lots) {
    qty += l.quantity
    pnl += l.quantity * (price - l.unitCost)
    if (pnl < -0.005 && (!best || pnl < best.pnl)) best = { quantity: qty, pnl }
  }
  return best
}

/**
 * Mayor ganancia realizable sin pasar de `tope` vendiendo desde el lote más
 * antiguo. Si un lote con ganancia cruza el tope, se vende la parte justa.
 */
export function mejorGananciaHasta(lots: readonly PlanLot[], price: number, tope: number): Venta | null {
  if (!(tope > 0.005)) return null
  let qty = 0, pnl = 0
  let best: Venta | null = null
  const consider = (v: Venta) => { if (v.pnl > 0.005 && v.pnl <= tope + 1e-9 && (!best || v.pnl > best.pnl)) best = v }
  for (const l of lots) {
    const porUnidad = price - l.unitCost
    const fin = pnl + l.quantity * porUnidad
    if (porUnidad > 0 && pnl < tope && fin > tope) consider({ quantity: qty + (tope - pnl) / porUnidad, pnl: tope })
    qty += l.quantity
    pnl = fin
    consider({ quantity: qty, pnl })
  }
  return best
}

export interface Sugerencia {
  asset: string
  walletId: string
  walletName: string
  walletColor: string
  quantity: number
  /** Cantidad de la wallet donde se vendería, para mostrar la proporción. */
  disponible: number
  pnl: number
  /** Compras del activo en los últimos 2 meses: la pérdida podría diferirse. */
  recompra: boolean
}

/** Agrupa los lotes por activo manteniendo el orden FIFO global del backend (#476). */
export function porActivo(lots: readonly PlanLot[]): PlanLot[][] {
  const groups = new Map<string, PlanLot[]>()
  for (const l of lots) {
    const g = groups.get(l.asset) ?? []
    g.push(l)
    groups.set(l.asset, g)
  }
  return [...groups.values()]
}

/**
 * Wallet donde se vendería (la de más cantidad) y los lotes FIFO que saldrían
 * vendiendo como mucho esa cantidad: el coste sigue el orden global, pero solo
 * se puede vender lo que hay en la wallet (igual que el simulador).
 */
export function ventaDesdeWallet(lots: readonly PlanLot[]): { wallet: PlanLot; disponible: number; lotes: PlanLot[] } {
  const porWallet = new Map<string, number>()
  for (const l of lots) porWallet.set(l.walletId, (porWallet.get(l.walletId) ?? 0) + l.quantity)
  const [walletId, disponible] = [...porWallet].reduce((a, b) => (b[1] > a[1] ? b : a))
  const lotes: PlanLot[] = []
  let resto = disponible
  for (const l of lots) {
    if (resto <= 1e-12) break
    const q = Math.min(l.quantity, resto)
    lotes.push(q < l.quantity ? { ...l, quantity: q } : l)
    resto -= q
  }
  return { wallet: lots.find(l => l.walletId === walletId)!, disponible, lotes }
}

export function sugerencias(
  lots: readonly PlanLot[],
  prices: Readonly<Record<string, number>>,
  colchon: number,
  comprasRecientes: Readonly<Record<string, string>>,
): { perdidas: Sugerencia[]; ganancias: Sugerencia[] } {
  const perdidas: Sugerencia[] = []
  const ganancias: Sugerencia[] = []
  for (const g of porActivo(lots)) {
    const price = prices[g[0].asset]
    if (!(price && price > 0)) continue
    const { wallet, disponible, lotes } = ventaDesdeWallet(g)
    const base = {
      asset: wallet.asset, walletId: wallet.walletId, walletName: wallet.walletName, walletColor: wallet.walletColor,
      disponible, recompra: !!comprasRecientes[wallet.asset],
    }
    const p = mejorPerdida(lotes, price)
    if (p) perdidas.push({ ...base, ...p })
    const gan = mejorGananciaHasta(lotes, price, colchon)
    if (gan) ganancias.push({ ...base, ...gan })
  }
  // Las afectadas por la regla de recompra van después; dentro, por importe.
  perdidas.sort((a, b) => Number(a.recompra) - Number(b.recompra) || a.pnl - b.pnl)
  ganancias.sort((a, b) => b.pnl - a.pnl)
  return { perdidas, ganancias }
}
