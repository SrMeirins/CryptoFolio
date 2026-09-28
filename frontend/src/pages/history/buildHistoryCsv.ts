import type { Transaction } from '../../api/portfolio'
import { sanitizeCsvField } from '../../utils/csvSafety'

const HEADER = [
  'Fecha', 'Tipo', 'Activo', 'Importe', 'Coste', 'Activo coste',
  'Precio unitario', 'Fee', 'Activo fee', 'Wallet', 'Cuenta', 'Manual', 'Notas',
].join(';')

/**
 * Construye el contenido CSV (delimitador ';') del export del historial de
 * transacciones (pantalla Historial). Función pura, sin efectos de DOM, para
 * poder testearla sin necesitar jsdom/testing-library.
 *
 * Se sanitizan con sanitizeCsvField (mitigación de CSV Formula Injection,
 * OWASP) todos los campos de texto libre que pueden provenir de datos
 * importados o introducidos por el usuario sin whitelist: activo, activo de
 * coste, activo de fee, nombre de wallet, cuenta y notas. El resto de
 * columnas (fecha, tipo de operación — enum fijo en BD —, importes
 * numéricos, flag manual) no son texto libre y no necesitan sanitizado.
 */
export function buildHistoryCsv(transactions: Transaction[]): string {
  const rows = transactions.map(tx => [
    new Date(tx.timestamp).toISOString().slice(0, 16).replace('T', ' '),
    tx.operation_type,
    sanitizeCsvField(tx.asset),
    tx.amount_net,
    tx.cost_amount ?? '',
    sanitizeCsvField(tx.cost_asset ?? ''),
    tx.price_per_unit ?? '',
    tx.fee_amount ?? '',
    sanitizeCsvField(tx.fee_asset ?? ''),
    sanitizeCsvField(tx.wallet_name),
    sanitizeCsvField(tx.account ?? ''),
    tx.manually_added ? 'Sí' : 'No',
    sanitizeCsvField(tx.notes ?? ''),
  ].join(';'))

  return [HEADER, ...rows].join('\n')
}
