import type { Transaction } from '../../api/portfolio'
import type { Currency } from '../../utils/format'
import { formatNumber } from '../../utils/format'

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

/**
 * Importe en EUR de una operación en la moneda de visualización (#177): en
 * USD, con el tipo de la fecha de la operación que envía el backend. null si
 * no hay importe o, en USD, si falta el tipo (no se muestran euros como dólares).
 */
export function toDisplayAmount(eur: number | null, tx: Pick<Transaction, 'usd_per_eur'>, currency: Currency): number | null {
  if (eur === null || currency === 'EUR') return eur
  const rate = tx.usd_per_eur === null || tx.usd_per_eur === undefined ? NaN : Number(tx.usd_per_eur)
  return rate > 0 ? eur * rate : null
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
  if (p >= 10000) return `${formatNumber(p, 0)} ${sym}`
  if (p >= 100)   return `${formatNumber(p, 2, 2)} ${sym}`
  if (p >= 1)     return `${formatNumber(p, 4, 4)} ${sym}`
  return `${formatNumber(p, 6, 6)} ${sym}`
}
