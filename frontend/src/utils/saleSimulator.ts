import type { OpenLot } from '../api/portfolio'

// Simulador de venta (#279): wallets con el activo y comisión recordada.

export interface WalletQuantity { walletId: string; walletName: string; quantity: number }

/** Cantidad del activo por wallet a partir de sus lotes abiertos, de mayor a menor. */
export function walletQuantities(lots: readonly OpenLot[]): WalletQuantity[] {
  const map = new Map<string, WalletQuantity>()
  for (const l of lots) {
    const w = map.get(l.wallet_id) ?? { walletId: l.wallet_id, walletName: l.wallet_name, quantity: 0 }
    w.quantity += parseFloat(l.quantity_remaining)
    map.set(l.wallet_id, w)
  }
  return [...map.values()].sort((a, b) => b.quantity - a.quantity || a.walletName.localeCompare(b.walletName))
}

const FEE_KEY = 'cryptofolio.simulator.feePct'
export const DEFAULT_FEE_PCT = 0.1

/** Comisión válida en % (0–10); fuera de rango o no numérica, la por defecto. */
export function parseFeePct(raw: string | null): number {
  const n = raw === null ? NaN : parseFloat(raw.replace(',', '.'))
  return Number.isFinite(n) && n >= 0 && n <= 10 ? n : DEFAULT_FEE_PCT
}

export function readFeePct(): number {
  try { return parseFeePct(localStorage.getItem(FEE_KEY)) } catch { return DEFAULT_FEE_PCT }
}

export function saveFeePct(pct: number): void {
  try { localStorage.setItem(FEE_KEY, String(pct)) } catch { /* almacenamiento no disponible */ }
}
