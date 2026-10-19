// Planificador de fin de año (#307): mejor venta parcial respetando FIFO por
// wallet y sugerencias de pérdidas a realizar y de ganancias que caben en el
// colchón. Funciones puras; los precios llegan en EUR del feed en vivo.

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
  /** Cantidad total de la wallet, para mostrar la proporción. */
  disponible: number
  pnl: number
  /** Compras del activo en los últimos 2 meses: la pérdida podría diferirse. */
  recompra: boolean
}

/** Agrupa los lotes por activo y wallet manteniendo el orden FIFO del backend. */
export function porActivoWallet(lots: readonly PlanLot[]): PlanLot[][] {
  const groups = new Map<string, PlanLot[]>()
  for (const l of lots) {
    const k = `${l.asset}|${l.walletId}`
    const g = groups.get(k) ?? []
    g.push(l)
    groups.set(k, g)
  }
  return [...groups.values()]
}

export function sugerencias(
  lots: readonly PlanLot[],
  prices: Readonly<Record<string, number>>,
  colchon: number,
  comprasRecientes: Readonly<Record<string, string>>,
): { perdidas: Sugerencia[]; ganancias: Sugerencia[] } {
  const perdidas: Sugerencia[] = []
  const ganancias: Sugerencia[] = []
  for (const g of porActivoWallet(lots)) {
    const price = prices[g[0].asset]
    if (!(price && price > 0)) continue
    const base = {
      asset: g[0].asset, walletId: g[0].walletId, walletName: g[0].walletName, walletColor: g[0].walletColor,
      disponible: g.reduce((s, l) => s + l.quantity, 0), recompra: !!comprasRecientes[g[0].asset],
    }
    const p = mejorPerdida(g, price)
    if (p) perdidas.push({ ...base, ...p })
    const gan = mejorGananciaHasta(g, price, colchon)
    if (gan) ganancias.push({ ...base, ...gan })
  }
  // Las afectadas por la regla de recompra van después; dentro, por importe.
  perdidas.sort((a, b) => Number(a.recompra) - Number(b.recompra) || a.pnl - b.pnl)
  ganancias.sort((a, b) => b.pnl - a.pnl)
  return { perdidas, ganancias }
}
