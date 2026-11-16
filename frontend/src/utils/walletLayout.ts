import type { WalletSummary } from './portfolioInventory'

// Disposición de las tarjetas de wallet de Portfolio (#526): ancho
// proporcional al peso con un mínimo legible, y las wallets pequeñas
// agrupadas en «Otras». Funciones puras.

/** Ancho mínimo de una tarjeta, para que siempre se lea. */
export const ANCHO_MINIMO = '15rem'

/**
 * Regla flex de una tarjeta: crece en proporción a su peso en la cartera a
 * partir del mínimo, así que la principal es la más ancha; si no caben, bajan
 * a la línea siguiente.
 */
export function flexTarjeta(pct: number): string {
  const peso = Number.isFinite(pct) && pct > 0 ? Math.max(1, Math.round(pct)) : 1
  return `${peso} 1 ${ANCHO_MINIMO}`
}

export interface GrupoOtras { wallets: WalletSummary[]; value: number; pct: number }

/**
 * Wallets por debajo de `umbralPct` del total, agrupadas en «Otras». Solo se
 * agrupan si son dos o más (una sola se muestra tal cual) y la wallet filtrada
 * nunca se esconde en el grupo. Con umbral 0, ninguna.
 */
export function agruparOtras(wallets: readonly WalletSummary[], umbralPct: number, seleccionada: string | null = null): { principales: WalletSummary[]; otras: GrupoOtras | null } {
  const pequenas = umbralPct > 0 ? wallets.filter(w => w.pct < umbralPct && w.walletId !== seleccionada) : []
  if (pequenas.length < 2) return { principales: [...wallets], otras: null }
  const ids = new Set(pequenas.map(w => w.walletId))
  return {
    principales: wallets.filter(w => !ids.has(w.walletId)),
    otras: { wallets: pequenas, value: pequenas.reduce((s, w) => s + w.value, 0), pct: pequenas.reduce((s, w) => s + w.pct, 0) },
  }
}
