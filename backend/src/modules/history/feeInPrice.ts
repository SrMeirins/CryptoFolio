import { BUY_TYPES, SELL_TYPES, sqlList } from './operationGroups';

// Operaciones con la comisión incluida en el precio (#431): el exchange la
// aplica en el tipo de cambio y el CSV solo trae lo que sale y lo que entra,
// sin fila de comisión. Se reconocen por la operación de su fila original del
// CSV (#374); no se inventa ninguna cifra. Solo constantes del módulo.

export const FEE_IN_PRICE_OPERATIONS: readonly string[] = [
  'Binance Convert',
  'Small Assets Exchange BNB',
  'Buy Crypto With Card',
  'Buy Crypto With Fiat',
  'Convert Fiat to Crypto OCBS',
  'Cross Margin Liquidation - Small Assets Takeover',
  'Isolated Margin Liquidation - Small Assets Takeover',
];

const SQL_LIST = `ARRAY[${FEE_IN_PRICE_OPERATIONS.map(o => `'${o.replace(/'/g, "''")}'`).join(', ')}]`;

/**
 * Operación de origen (texto) si la compra o venta de `alias` tiene la
 * comisión incluida en el precio y ninguna otra registrada; NULL si no. Solo
 * compras y ventas: un tipo distinto con ese origen sería una clasificación
 * dudosa, no una comisión oculta.
 */
export function feeInPriceSql(alias: string): string {
  return `(CASE WHEN ${alias}.operation_type IN ${sqlList([...BUY_TYPES, ...SELL_TYPES])}
    AND ${alias}.fee_asset IS NULL AND ${alias}.included_fee_amount IS NULL THEN (
    SELECT rt.original_row->>'Operation' FROM raw_transactions rt
    WHERE rt.transaction_id = ${alias}.id AND rt.original_row->>'Operation' = ANY(${SQL_LIST})
    LIMIT 1) END)`;
}
