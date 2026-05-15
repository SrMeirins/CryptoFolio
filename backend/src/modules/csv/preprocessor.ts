import { RawCsvRow } from './types';

/**
 * Pre-procesa filas especiales antes de la agrupación por timestamp.
 *
 * Problemas que resuelve:
 * 1. Buy Crypto With Fiat: EUR y Cripto tienen timestamps distintos,
 *    se enlazan por el Wallet ID del Remark.
 */
export function preprocess(rows: RawCsvRow[]): RawCsvRow[] {
  const result: RawCsvRow[] = [];
  const buyCryptoFiatRows = rows.filter((r) => r.operation === 'Buy Crypto With Fiat');
  const buyCryptoFiatHashes = new Set(buyCryptoFiatRows.map((r) => r.rowHash));

  // Agrupar Buy Crypto With Fiat por Remark (Wallet ID)
  const fiatByRemark = new Map<string, RawCsvRow[]>();
  for (const row of buyCryptoFiatRows) {
    const key = row.remark;
    if (!fiatByRemark.has(key)) fiatByRemark.set(key, []);
    fiatByRemark.get(key)!.push(row);
  }

  // Unificar cada par EUR+Cripto al timestamp de la cripto recibida
  for (const [, group] of fiatByRemark) {
    const cryptoRow = group.find((r) => r.coin !== 'EUR');
    const eurRow = group.find((r) => r.coin === 'EUR');
    if (cryptoRow && eurRow) {
      // Usar el timestamp de la cripto recibida para ambas filas
      const unified = group.map((r) => ({ ...r, time: cryptoRow.time }));
      result.push(...unified);
    } else {
      result.push(...group);
    }
  }

  // Añadir el resto de filas sin modificar
  for (const row of rows) {
    if (!buyCryptoFiatHashes.has(row.rowHash)) {
      result.push(row);
    }
  }

  return result;
}
