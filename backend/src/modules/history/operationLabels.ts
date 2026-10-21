import { DB_OPERATION_TYPES, DbOperationType } from './operationGroups';

// Etiquetas en castellano de cada tipo (#349), para ordenar el Historial por lo
// que ve el usuario. Deben coincidir con OP_META del frontend
// (frontend/src/constants/operations.ts): lo comprueba un test del frontend.
export const OPERATION_LABELS: Record<DbOperationType, string> = {
  BUY: 'Compra',
  BUY_FIAT: 'Compra EUR',
  BUY_CRYPTO: 'Compra cripto',
  SELL: 'Venta',
  SELL_FIAT: 'Venta EUR',
  SELL_CRYPTO: 'Venta cripto',
  DEPOSIT_FIAT: 'Depósito EUR',
  DEPOSIT_CRYPTO: 'Depósito cripto',
  WITHDRAW: 'Retirada',
  WITHDRAW_FIAT: 'Retirada EUR',
  STAKING_REWARD: 'Staking',
  MINING_REWARD: 'Minería',
  LENDING_INTEREST: 'Intereses',
  LENDING_INTEREST_LOCKED: 'Intereses bloq.',
  CASHBACK: 'Cashback',
  AIRDROP: 'Airdrop',
  FORK: 'Fork',
  TRANSFER_INTERNAL: 'Transferencia',
  STAKING_LOCK: 'Bloqueo staking',
  STAKING_UNLOCK: 'Desbloq. staking',
  LAUNCHPOOL_LOCK: 'Bloqueo launchpool',
  LAUNCHPOOL_UNLOCK: 'Desbloq. launchpool',
  MARGIN_BORROW: 'Préstamo margen',
  MARGIN_REPAY: 'Devolución margen',
  GIFT_SENT: 'Regalo',
  LOST: 'Pérdida',
  FEE: 'Comisión',
  FEE_NETWORK: 'Comisión red',
  FEE_EXCHANGE: 'Comisión exchange',
  IGNORED: 'Ignorada',
};

/**
 * Expresión SQL con la posición alfabética (es-ES) de la etiqueta de
 * `t.operation_type`. Solo contiene códigos del enum y enteros, nunca texto
 * del usuario ni las etiquetas.
 */
export function operationLabelRankSql(column = 't.operation_type'): string {
  const ordered = [...DB_OPERATION_TYPES].sort((a, b) =>
    OPERATION_LABELS[a].localeCompare(OPERATION_LABELS[b], 'es', { sensitivity: 'base' }));
  const whens = ordered.map((code, i) => `WHEN '${code}' THEN ${i}`).join(' ');
  return `(CASE ${column}::text ${whens} END)`;
}
