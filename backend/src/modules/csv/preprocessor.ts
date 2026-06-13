import { RawCsvRow } from './types';

/**
 * Pre-procesa filas especiales antes de la agrupación por timestamp.
 *
 * Problemas que resuelve:
 * 1. Buy Crypto With Fiat / Buy Crypto With Card / Convert Fiat to Crypto OCBS:
 *    La fila EUR y la fila Cripto pueden tener timestamps distintos.
 *    Se enlazan por el remark (ID de orden) y se unifican al timestamp de la cripto.
 */

// Operaciones que siguen el patrón remark-linking (EUR + cripto separadas en el tiempo)
const REMARK_LINKED_OPS = new Set([
  'Buy Crypto With Fiat',
  'Buy Crypto With Card',
  'Convert Fiat to Crypto OCBS',
]);

export function preprocess(rows: RawCsvRow[]): RawCsvRow[] {
  const result: RawCsvRow[] = [];
  const linkedRows = rows.filter((r) => REMARK_LINKED_OPS.has(r.operation));
  const linkedHashes = new Set(linkedRows.map((r) => r.rowHash));

  // Solo enlazar por remark cuando el remark está presente.
  // Sin remark, las filas ya comparten el mismo timestamp → groupByTimestamp las agrupa solo.
  // Si agrupáramos filas sin remark bajo la misma clave vacía, mezclaríamos compras distintas.
  const byOpRemark = new Map<string, RawCsvRow[]>();
  const noRemarkLinked: RawCsvRow[] = [];

  for (const row of linkedRows) {
    if (!row.remark) {
      noRemarkLinked.push(row);
      continue;
    }
    const key = `${row.operation}|${row.remark}`;
    if (!byOpRemark.has(key)) byOpRemark.set(key, []);
    byOpRemark.get(key)!.push(row);
  }

  // Unificar cada par (gasto + ingreso) al timestamp de la fila positiva (cripto recibida)
  for (const [, group] of byOpRemark) {
    const receivedRow = group.find((r) => r.change > 0);
    if (receivedRow) {
      const unified = group.map((r) => ({ ...r, time: receivedRow.time }));
      result.push(...unified);
    } else {
      result.push(...group);
    }
  }

  // Sin remark → pasar sin modificar (ya están al timestamp correcto)
  result.push(...noRemarkLinked);

  // Añadir el resto de filas sin modificar
  for (const row of rows) {
    if (!linkedHashes.has(row.rowHash)) {
      result.push(row);
    }
  }

  return result;
}
