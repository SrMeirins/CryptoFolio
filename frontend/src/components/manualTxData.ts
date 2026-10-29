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

/**
 * Formulario con el que se edita cada tipo (#394). BUY y SELL llegan del CSV
 * de Binance y no tienen formulario propio: se editan con el equivalente del
 * catálogo según la contrapartida (EUR o sin ella con el de EUR; cualquier
 * otro activo con el de cripto, que muestra qué activo es).
 */
export function editFormType(tx: Pick<Transaction, 'operation_type' | 'cost_asset'>): string {
  const fiat = !tx.cost_asset || tx.cost_asset.toUpperCase() === 'EUR'
  if (tx.operation_type === 'BUY')  return fiat ? 'BUY_FIAT' : 'BUY_CRYPTO'
  if (tx.operation_type === 'SELL') return fiat ? 'SELL_FIAT' : 'SELL_CRYPTO'
  return tx.operation_type
}

/**
 * Tipo a guardar (#394): si se mantiene el formulario equivalente, se conserva
 * el tipo original (la etiqueta venta o permuta del detalle FIFO y los
 * contadores de importación dependen de él); si se eligió otro, ese.
 */
export function savedOperationType(chosen: string, original?: Pick<Transaction, 'operation_type' | 'cost_asset'>): string {
  return original && editFormType(original) === chosen ? original.operation_type : chosen
}
