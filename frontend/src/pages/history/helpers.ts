import type { Transaction, ValuationSource } from '../../api/portfolio'
import type { Currency } from '../../utils/format'
import { formatNumber } from '../../utils/format'
import { zonedFormat } from '../../utils/zonedFormat'

// Fechas en la zona de la aplicación, no en la del navegador ni en UTC (#346):
// la hora de la fila y el día en que se agrupa salen del mismo instante local.
const DATE_FMT = () => zonedFormat('es-ES', { day: '2-digit', month: 'short', year: '2-digit' })
const TIME_FMT = () => zonedFormat('es-ES', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
const DAY_KEY_FMT = () => zonedFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' })
const DAY_LONG_FMT = new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })

export function fmtDate(ts: string): { date: string; time: string } {
  const d = new Date(ts)
  return { date: DATE_FMT().format(d), time: TIME_FMT().format(d) }
}

/** Día local (AAAA-MM-DD) de un instante, para agrupar el listado. */
export function localDayKey(ts: string): string {
  return DAY_KEY_FMT().format(new Date(ts))
}

/** Cabecera de un día (AAAA-MM-DD): «Jueves, 3 de septiembre de 2026», solo la inicial en mayúscula. */
export function fmtDateGroup(day: string): string {
  const text = DAY_LONG_FMT.format(new Date(`${day}T12:00:00Z`))
  return text.charAt(0).toUpperCase() + text.slice(1)
}

export function fmtMonthLabel(mes: string): string {
  const [y, m] = mes.split('-')
  return new Date(parseInt(y), parseInt(m) - 1, 1)
    .toLocaleDateString('es-ES', { month: 'short', year: '2-digit' })
}

/** Valor en EUR de la operación en su fecha, calculado por el backend (#346). */
export function calcEurValue(tx: Pick<Transaction, 'value_eur'>): number | null {
  return tx.value_eur ?? null
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

/** Valor en EUR de la comisión (#346); null si no hay comisión o no tiene precio. */
export function calcFeeEur(tx: Pick<Transaction, 'fee_value_eur'>): number | null {
  return tx.fee_value_eur ?? null
}

/**
 * Texto de ayuda del origen de un valor (#346): visible como tooltip y como
 * texto accesible. null cuando la cifra es exacta (coste o FIFO).
 */
export function valuationHint(source: ValuationSource | null): string | null {
  if (source === 'estimado') return 'Estimado con el precio de cierre diario del activo'
  if (source === 'sin_precio') return 'Sin precio disponible para esta fecha'
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

// Sentido de cada tipo, espejo de INFLOW_TYPES/OUTFLOW_TYPES del backend
// (modules/history/operationGroups.ts). Un retiro lleva «−» porque sale de su
// wallet de origen, aunque vaya a otra propia.
const INFLOW = new Set([
  'BUY', 'BUY_FIAT', 'BUY_CRYPTO', 'STAKING_REWARD', 'MINING_REWARD', 'LENDING_INTEREST',
  'LENDING_INTEREST_LOCKED', 'CASHBACK', 'AIRDROP', 'FORK', 'DEPOSIT_FIAT', 'DEPOSIT_CRYPTO', 'MARGIN_BORROW',
])
const OUTFLOW = new Set([
  'SELL', 'SELL_FIAT', 'SELL_CRYPTO', 'GIFT_SENT', 'LOST', 'FEE', 'FEE_NETWORK', 'FEE_EXCHANGE',
  'WITHDRAW', 'WITHDRAW_FIAT', 'MARGIN_REPAY',
])

/** Signo de la cantidad: entrada, salida o neutra (transferencias, bloqueos). */
export function flowSign(operationType: string): '+' | '−' | '' {
  if (INFLOW.has(operationType)) return '+'
  if (OUTFLOW.has(operationType)) return '−'
  return ''
}

/**
 * Sentido de una operación entre wallets respecto a la wallet filtrada (#395):
 * «entrada» si llega a ella desde otra, «salida» si sale de ella hacia otra.
 * Sin filtro, o sin wallet de destino, no hay sentido propio.
 */
export function walletFlow(
  tx: Pick<Transaction, 'wallet_id' | 'destination_wallet_id'>, walletId?: string,
): 'entrada' | 'salida' | null {
  if (!walletId || !tx.destination_wallet_id || tx.destination_wallet_id === tx.wallet_id) return null
  if (tx.destination_wallet_id === walletId) return 'entrada'
  if (tx.wallet_id === walletId) return 'salida'
  return null
}

/** Signo de la fila (#395): el de la wallet filtrada si la operación es entre wallets; si no, el del tipo. */
export function rowFlowSign(
  tx: Pick<Transaction, 'operation_type' | 'wallet_id' | 'destination_wallet_id'>, walletId?: string,
): '+' | '−' | '' {
  const flow = walletFlow(tx, walletId)
  if (flow === 'entrada') return '+'
  if (flow === 'salida') return '−'
  return flowSign(tx.operation_type)
}

/**
 * Comisión total de una fila (#371): la suya más las agrupadas, en la moneda de
 * visualización. `total` suma las que tienen precio; `missing` cuenta las que
 * no (o no tienen tipo USD) y `estimated` indica si alguna es estimada.
 */
export function feeSummary(
  tx: Pick<Transaction, 'fee_value_eur' | 'fee_value_source' | 'fee_amount' | 'grouped_fees' | 'usd_per_eur'>,
  currency: Currency,
): { count: number; total: number | null; missing: number; estimated: boolean } {
  const items: { eur: number | null; source: ValuationSource | null }[] = []
  if (tx.fee_amount && Number(tx.fee_amount) > 0) items.push({ eur: tx.fee_value_eur, source: tx.fee_value_source })
  for (const f of tx.grouped_fees ?? []) items.push({ eur: f.value_eur, source: f.value_source })
  let total = 0, known = 0, missing = 0
  for (const it of items) {
    const v = toDisplayAmount(it.eur, tx, currency)
    if (v === null) missing++
    else { total += v; known++ }
  }
  return { count: items.length, total: known ? total : null, missing, estimated: items.some(i => i.source === 'estimado') }
}
