import {
  BUY_TYPES, FEE_TYPES, FIAT_ASSETS, INCOME_TYPES, INVESTMENT_TYPES, MARGIN_TYPES, SELL_TYPES, STABLECOINS, sqlList,
} from './operationGroups';

// Qué suma cada tarjeta del resumen del Historial (#403, #407), como
// condiciones SQL sobre una transacción. Las usan las estadísticas y el filtro
// «Tarjeta» de la lista, así que pulsar una tarjeta muestra justo lo que suma.
// Solo constantes del módulo: nunca entrada del usuario.
//
// Compras y ventas según el lado del fiat: recibir fiat es una venta y
// entregarlo, una compra, aunque el exchange lo registre al revés. Pasar una
// stablecoin a fiat no es una venta en el resumen: la stablecoin hace de
// efectivo y su valor ya se contó al vender la cripto por ella (Fiscal sí la
// declara como transmisión).

export const SUMMARY_CARDS = ['invertido', 'retirado', 'ventas', 'ingresos', 'comisiones'] as const;
export type SummaryCard = typeof SUMMARY_CARDS[number];

const FIAT = sqlList(FIAT_ASSETS);
const STABLE = sqlList(STABLECOINS);

/** Prefijo de columna: `t.` con alias o nada si las columnas son directas. */
const col = (alias: string) => (alias ? `${alias}.` : '');

export function cardSql(alias: string) {
  const c = col(alias);
  const isBuy = `${c}operation_type IN ${sqlList(BUY_TYPES)}`;
  const isSell = `${c}operation_type IN ${sqlList(SELL_TYPES)}`;
  // COALESCE: sin contrapartida (cost_asset NULL) la comparación da NULL, no FALSE.
  const costIn = (list: string) => `COALESCE(${c}cost_asset IN ${list}, FALSE)`;
  /** El exchange registra la venta de cripto como compra de fiat… */
  const fiatBought = `(${isBuy} AND ${c}asset IN ${FIAT})`;
  /** …y la compra de cripto con fiat como venta de fiat. */
  const fiatSold = `(${isSell} AND ${c}asset IN ${FIAT})`;
  /** Stablecoin a fiat, se registre como venta de la stablecoin o como compra de fiat. */
  const stableToFiat = `((${isSell} AND ${c}asset IN ${STABLE} AND ${costIn(FIAT)}) OR (${fiatBought} AND ${costIn(STABLE)}))`;
  return {
    fiatBought, fiatSold, stableToFiat,
    invested: `((${c}operation_type IN ${sqlList(INVESTMENT_TYPES)} AND ${costIn(FIAT)}) OR ${fiatSold})`,
    /** Fiat recibido a cambio de cripto (también de stablecoins): Invertido menos esto es el neto. */
    recovered: `((${isSell} AND ${costIn(FIAT)}) OR ${fiatBought})`,
    sale: `((${fiatBought} OR (${isSell} AND ${c}asset NOT IN ${FIAT})) AND NOT ${stableToFiat})`,
    withdrawn: `${c}operation_type = 'WITHDRAW_FIAT'`,
    deposited: `${c}operation_type = 'DEPOSIT_FIAT'`,
    income: `${c}operation_type IN ${sqlList(INCOME_TYPES)}`,
    fee: `(${c}operation_type IN ${sqlList(FEE_TYPES)} OR (${c}fee_asset IS NOT NULL AND ${c}fee_amount > 0))`,
  };
}

/** Condición de la tarjeta para el filtro de la lista. */
export function cardPredicate(card: SummaryCard, alias: string): string {
  const s = cardSql(alias);
  return { invertido: s.invested, retirado: s.withdrawn, ventas: s.sale, ingresos: s.income, comisiones: s.fee }[card];
}

/**
 * Operativa de margen (#403): cuentas de margen, préstamos y lo que entra o
 * sale de una wallet de margen. `accountsParam` es el parámetro con los
 * nombres de cuenta (tienen espacios: no van con sqlList).
 */
export function marginSql(alias: string, accountsParam: string): string {
  const c = col(alias);
  // Subconsulta sin correlación: se evalúa una vez, no por fila.
  const marginWallets = `(SELECT mt.wallet_id FROM transactions mt WHERE mt.account = ANY(${accountsParam}))`;
  return `(COALESCE(${c}account = ANY(${accountsParam}), FALSE) OR ${c}operation_type IN ${sqlList(MARGIN_TYPES)}
    OR ${c}wallet_id IN ${marginWallets} OR COALESCE(${c}destination_wallet_id IN ${marginWallets}, FALSE))`;
}
