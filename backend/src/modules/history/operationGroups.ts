// Grupos de tipos de operación del Historial (#346). Única fuente de verdad
// para el listado, las estadísticas y la valoración: antes cada consulta
// tenía su propia lista y las tarjetas no cuadraban con el gráfico mensual.

/** Espejo del enum operation_type de la BD (un test lo compara con schema.sql). */
export const DB_OPERATION_TYPES = [
  'BUY', 'SELL',
  'BUY_FIAT', 'BUY_CRYPTO',
  'SELL_FIAT', 'SELL_CRYPTO',
  'DEPOSIT_FIAT', 'DEPOSIT_CRYPTO',
  'WITHDRAW_FIAT',
  'WITHDRAW',
  'FEE', 'FEE_NETWORK', 'FEE_EXCHANGE',
  'TRANSFER_INTERNAL',
  'STAKING_LOCK', 'STAKING_UNLOCK', 'LAUNCHPOOL_LOCK', 'LAUNCHPOOL_UNLOCK',
  'STAKING_REWARD', 'MINING_REWARD',
  'LENDING_INTEREST', 'LENDING_INTEREST_LOCKED', 'CASHBACK',
  'AIRDROP', 'FORK',
  'GIFT_SENT', 'LOST',
  'MARGIN_BORROW', 'MARGIN_REPAY',
  'IGNORED',
] as const;
export type DbOperationType = typeof DB_OPERATION_TYPES[number];

/** Compras (gráfico mensual y número de compras). */
export const BUY_TYPES: readonly DbOperationType[] = ['BUY', 'BUY_FIAT', 'BUY_CRYPTO'];
/** Compras que pueden pagarse con fiat: base de «Invertido». */
export const INVESTMENT_TYPES: readonly DbOperationType[] = ['BUY', 'BUY_FIAT'];
/** Ventas propiamente dichas. */
export const SELL_TYPES: readonly DbOperationType[] = ['SELL', 'SELL_FIAT', 'SELL_CRYPTO'];
/** Salidas sin contraprestación: no son ventas. */
export const OTHER_OUT_TYPES: readonly DbOperationType[] = ['GIFT_SENT', 'LOST'];
export const INCOME_TYPES: readonly DbOperationType[] = [
  'STAKING_REWARD', 'MINING_REWARD', 'LENDING_INTEREST', 'LENDING_INTEREST_LOCKED', 'CASHBACK', 'AIRDROP', 'FORK',
];
export const TRANSFER_TYPES: readonly DbOperationType[] = [
  'TRANSFER_INTERNAL', 'WITHDRAW', 'WITHDRAW_FIAT', 'DEPOSIT_FIAT', 'DEPOSIT_CRYPTO',
];
export const FEE_TYPES: readonly DbOperationType[] = ['FEE', 'FEE_NETWORK', 'FEE_EXCHANGE'];

/** Operaciones cuyo valor es el coste del lote FIFO que abren. */
export const ACQUISITION_TYPES: readonly DbOperationType[] = [
  ...BUY_TYPES,
  'STAKING_REWARD', 'MINING_REWARD', 'LENDING_INTEREST', 'LENDING_INTEREST_LOCKED', 'CASHBACK', 'AIRDROP',
  'DEPOSIT_CRYPTO', 'MARGIN_BORROW',
];
/** Operaciones cuyo valor son los proceeds de los lotes FIFO que consumen. */
export const DISPOSAL_TYPES: readonly DbOperationType[] = [...SELL_TYPES, 'GIFT_SENT', ...FEE_TYPES];

/** Entradas de valor del total filtrado. */
export const INFLOW_TYPES: readonly DbOperationType[] = [
  ...BUY_TYPES, ...INCOME_TYPES, 'DEPOSIT_FIAT', 'DEPOSIT_CRYPTO', 'MARGIN_BORROW',
];
/**
 * Salidas de valor del total filtrado. WITHDRAW solo cuenta cuando no va a una
 * wallet propia (ver flowDirectionSql): moverse entre wallets propias no es salida.
 */
export const OUTFLOW_TYPES: readonly DbOperationType[] = [
  ...SELL_TYPES, ...OTHER_OUT_TYPES, ...FEE_TYPES, 'WITHDRAW', 'WITHDRAW_FIAT', 'MARGIN_REPAY',
];

/** Monedas fiat: sin lote FIFO, su valor en EUR es directo (EUR) o vía el lote del otro lado. */
export const FIAT_ASSETS = ['EUR', 'USD', 'GBP', 'CHF', 'BRL', 'ARS'] as const;

/**
 * Lista SQL literal de valores constantes (`('BUY','SELL')`). Solo admite los
 * valores de las constantes de este módulo, nunca entrada del usuario.
 */
export function sqlList(values: readonly string[]): string {
  for (const v of values) {
    if (!/^[A-Z_]+$/.test(v)) throw new Error(`Valor no permitido en sqlList: ${v}`);
  }
  return `(${values.map(v => `'${v}'`).join(',')})`;
}
