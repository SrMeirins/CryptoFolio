import type { Transaction } from '../api/portfolio'

/**
 * Neto a enviar (#378): si se edita sin cambiar la cantidad, se conserva el
 * neto guardado (en una importada puede ser menor que la cantidad, con la
 * comisión descontada); si no, el neto es la cantidad, como al crear.
 */
export function amountNetFor(amount: unknown, original?: Pick<Transaction, 'amount' | 'amount_net'>): unknown {
  if (amount == null || amount === '') return null
  if (original && original.amount != null && Number(amount) === Number(original.amount)) return original.amount_net
  return amount
}
