import type { Transaction } from '../../api/portfolio'

export function fmtDate(ts: string): { date: string; time: string } {
  const d = new Date(ts)
  return {
    date: d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: '2-digit' }),
    time: d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
  }
}

export function fmtDateGroup(ts: string): string {
  return new Date(ts).toLocaleDateString('es-ES', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })
}

export function fmtMonthLabel(mes: string): string {
  const [y, m] = mes.split('-')
  return new Date(parseInt(y), parseInt(m) - 1, 1)
    .toLocaleDateString('es-ES', { month: 'short', year: '2-digit' })
}

export function calcEurValue(tx: Transaction): number | null {
  if (tx.cost_asset === 'EUR' && tx.cost_amount) return Math.abs(parseFloat(tx.cost_amount))
  // price_per_unit solo está en EUR para ops sin cost_asset (income: staking, airdrop...)
  // Para swaps cripto↔cripto price_per_unit es el ratio en units del cost_asset, no en EUR
  if (!tx.cost_asset && tx.price_per_unit && tx.amount_net) {
    const p = parseFloat(tx.price_per_unit), a = Math.abs(parseFloat(tx.amount_net))
    if (!isNaN(p) && !isNaN(a) && p > 0 && a > 0) return p * a
  }
  return null
}

export function calcFeeEur(tx: Transaction): number | null {
  if (!tx.fee_amount || !tx.fee_asset) return null
  const amt = parseFloat(tx.fee_amount)
  if (isNaN(amt) || amt <= 0) return null
  if (tx.fee_asset === 'EUR') return amt
  if (tx.fee_asset === tx.asset && tx.price_per_unit) {
    const p = parseFloat(tx.price_per_unit)
    if (!isNaN(p) && p > 0) return amt * p
  }
  return null
}

/**
 * Precio unitario formateado con decimales adaptativos y el símbolo del
 * activo de coste (no siempre EUR: en swaps cripto↔cripto es el otro
 * activo) — por eso no reutiliza formatPrice() de utils/format.ts, que
 * asume siempre € como divisa.
 */
export function formatPriceLine(tx: Transaction): string | null {
  if (!tx.price_per_unit) return null
  const p = parseFloat(tx.price_per_unit)
  if (isNaN(p) || p <= 0) return null
  const sym = tx.cost_asset ?? 'EUR'
  if (p >= 10000) return `${p.toLocaleString('es-ES', { maximumFractionDigits: 0 })} ${sym}`
  if (p >= 100)   return `${p.toFixed(2)} ${sym}`
  if (p >= 1)     return `${p.toFixed(4)} ${sym}`
  return `${p.toFixed(6)} ${sym}`
}
