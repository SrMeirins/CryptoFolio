import type { RawRowWithHash } from './types';
import { CANONICAL_COLUMNS } from './languages';
import { BITVAVO_COLUMNS } from './bitvavoValidator';

// Filas originales del CSV (#374): cada hash de raw_transactions guarda su
// fila tal como venía en el archivo, para que el detalle de una transacción
// muestre de qué filas sale (p. ej. los fills parciales de una orden).

/** Columnas que nunca se guardan (minimización de datos): el identificador de la cuenta. */
export const PRIVATE_COLUMNS: readonly string[] = ['User ID'];

/** Lo mínimo para consultar: el `db` de la app, un Pool o un cliente. */
type Queryable = { query: (text: string, params?: unknown[]) => Promise<{ rowCount?: number | null }> };

const CHUNK = 500;

/** La fila sin las columnas privadas. */
export function originalRow(record: Record<string, string>): Record<string, string> {
  const row: Record<string, string> = {};
  for (const [k, v] of Object.entries(record)) {
    if (!PRIVATE_COLUMNS.includes(k)) row[k] = v;
  }
  return row;
}

/** Fila original de cada hash del archivo. */
export function originalRowsByHash(rawRows: readonly RawRowWithHash[]): Map<string, Record<string, string>> {
  return new Map(rawRows.map(({ record, hash }) => [hash, originalRow(record)]));
}

/**
 * Completa las filas ya guardadas sin original (importadas antes de #374).
 * Nunca sobrescribe una fila original ya guardada. Devuelve cuántas completa.
 */
export async function completeOriginalRows(db: Queryable, rows: ReadonlyMap<string, Record<string, string>>): Promise<number> {
  const entries = [...rows].map(([h, r]) => ({ h, r }));
  let completed = 0;
  for (let i = 0; i < entries.length; i += CHUNK) {
    const res = await db.query(
      `UPDATE raw_transactions rt SET original_row = v.r
       FROM jsonb_to_recordset($1::jsonb) AS v(h text, r jsonb)
       WHERE rt.row_hash = v.h AND rt.original_row IS NULL`,
      [JSON.stringify(entries.slice(i, i + CHUNK))],
    );
    completed += res.rowCount ?? 0;
  }
  return completed;
}

/** Columnas de cada exchange en el orden de su CSV (JSONB no conserva el orden). */
const COLUMN_ORDER: Readonly<Record<string, readonly string[]>> = {
  binance: CANONICAL_COLUMNS,
  bitvavo: BITVAVO_COLUMNS,
};

export interface OriginalRowsTable {
  columns: string[];
  rows: string[][];
}

/**
 * Tabla de las filas originales para el detalle: columnas en el orden del CSV
 * del exchange (las desconocidas al final), nunca las privadas, y filas en
 * orden estable por esas columnas.
 */
export function originalRowsTable(exchange: string | null, rows: readonly Record<string, unknown>[]): OriginalRowsTable {
  const keys = new Set(rows.flatMap(r => Object.keys(r)).filter(k => !PRIVATE_COLUMNS.includes(k)));
  const known = (COLUMN_ORDER[exchange ?? ''] ?? []).filter(k => keys.has(k));
  const columns = [...known, ...[...keys].filter(k => !known.includes(k)).sort()];
  const table = rows.map(r => columns.map(c => (r[c] === undefined || r[c] === null ? '' : String(r[c]))));
  table.sort((a, b) => {
    for (let i = 0; i < a.length; i++) {
      // Orden natural: «120000» antes que «1156866.54».
      const d = a[i].localeCompare(b[i], 'en', { numeric: true });
      if (d !== 0) return d;
    }
    return 0;
  });
  return { columns, rows: table };
}
