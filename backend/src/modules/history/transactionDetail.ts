import type { QueryResultRow } from 'pg';
import { historyExportSchema } from './listFilters';
import { historyRowsSql } from './historyQuery';
import { INCOME_TYPES } from './operationGroups';
import { originalRowsTable } from '../csv/originalRows';

/** Máximo de filas originales en el detalle (una orden real llega a decenas). */
const MAX_ORIGINAL_ROWS = 1000;

// Detalle de una transacción del Historial (#373): la fila valorada (igual que
// en el listado), su trazabilidad FIFO en ambos sentidos (de dónde salen sus
// unidades y adónde van), el archivo de origen y cuántas filas suyas agrupa,
// los datos on-chain con enlaces al explorador y los años fiscales afectados.
// Las filas originales del CSV se guardan desde #374; en importaciones
// anteriores solo hay hashes y se cuentan.

/** Lo mínimo para consultar: el `db` de la app, un Pool o un cliente. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Queryable = { query: (text: string, params?: unknown[]) => Promise<{ rows: QueryResultRow[] | any[] }> };

const num = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

/**
 * URL del explorador a partir de la plantilla de la red. Las redes pueden ser
 * personalizadas (dato del usuario): solo se aceptan plantillas http(s) y el
 * valor se codifica, así que un hash o una dirección no pueden inyectar nada.
 */
export function explorerUrl(template: string | null, placeholder: '{tx_hash}' | '{address}', value: string | null): string | null {
  if (!template || !value || !template.includes(placeholder)) return null;
  if (!/^https?:\/\/[^\s]+$/i.test(template)) return null;
  const url = template.replace(placeholder, encodeURIComponent(value));
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.href : null;
  } catch {
    return null;
  }
}

export async function getTransactionDetail(db: Queryable, id: string, tz: string) {
  const defaults = historyExportSchema.parse({});
  const row = historyRowsSql(defaults, tz, undefined, true, id);
  const tx = (await db.query(row.sql, row.params)).rows[0];
  if (!tx) return null;

  const [consumed, opened, origin, raw, chain] = await Promise.all([
    // De dónde salen sus unidades: lotes que consume esta operación.
    db.query(
      `SELECT c.id, l.id AS lot_id, l.asset, l.opened_at, l.price_per_unit_eur,
         c.quantity_consumed, c.cost_basis_consumed_eur, c.proceeds_eur, c.gain_loss_eur,
         c.fiscal_event_type, c.consumed_at,
         o.id AS origin_id, o.operation_type AS origin_type, o.timestamp AS origin_timestamp,
         w.name AS wallet_name
       FROM fifo_lot_consumptions c
       JOIN fifo_lots l ON l.id = c.lot_id
       JOIN transactions o ON o.id = l.open_transaction_id
       JOIN wallets w ON w.id = l.wallet_id
       WHERE c.consuming_transaction_id = $1
       ORDER BY l.opened_at, l.created_at`, [id]),
    // Adónde van: lotes que abre esta operación…
    db.query(
      `SELECT l.id, l.asset, l.quantity_original, l.quantity_remaining, l.price_per_unit_eur, l.fee_eur,
         l.opened_at, l.is_closed, w.name AS wallet_name
       FROM fifo_lots l JOIN wallets w ON w.id = l.wallet_id
       WHERE l.open_transaction_id = $1
       ORDER BY l.created_at`, [id]),
    db.query(`SELECT id, filename, exchange, imported_at FROM csv_imports WHERE id = $1`, [tx.import_id]),
    // Filas del archivo que agrupa (p. ej. los fills parciales de una orden).
    db.query(
      `SELECT count(*)::int AS n,
         (SELECT COALESCE(json_agg(o.original_row), '[]'::json) FROM (
            SELECT original_row FROM raw_transactions
            WHERE transaction_id = $1 AND original_row IS NOT NULL LIMIT ${MAX_ORIGINAL_ROWS}) o) AS originals
       FROM raw_transactions WHERE transaction_id = $1`, [id]),
    db.query(
      `SELECT t.tx_hash, t.counterparty_address, n.name AS network, n.explorer_url, n.explorer_tx_url
       FROM transactions t LEFT JOIN networks n ON n.id = t.counterparty_network_id
       WHERE t.id = $1`, [id]),
  ]);

  // …y qué operaciones posteriores los consumieron.
  const lotIds = opened.rows.map(l => l.id as string);
  const later = lotIds.length ? (await db.query(
    `SELECT c.lot_id, c.consuming_transaction_id AS tx_id, t.operation_type, t.timestamp,
       c.quantity_consumed, c.proceeds_eur, c.gain_loss_eur, c.fiscal_event_type
     FROM fifo_lot_consumptions c JOIN transactions t ON t.id = c.consuming_transaction_id
     WHERE c.lot_id = ANY($1::uuid[])
     ORDER BY c.consumed_at, c.id`, [lotIds])).rows : [];

  // Años fiscales: los de sus eventos con ganancia o pérdida, y el de la propia
  // operación si es un rendimiento (staking, intereses…).
  const years = new Set<number>((await db.query(
    `SELECT DISTINCT EXTRACT(YEAR FROM c.consumed_at AT TIME ZONE $2)::int AS y
     FROM fifo_lot_consumptions c WHERE c.consuming_transaction_id = $1 AND c.fiscal_event_type <> 'NONE'`, [id, tz])).rows.map(r => r.y));
  if ((INCOME_TYPES as readonly string[]).includes(tx.operation_type)) {
    years.add(Number((await db.query(`SELECT EXTRACT(YEAR FROM $1::timestamptz AT TIME ZONE $2)::int AS y`, [tx.timestamp, tz])).rows[0].y));
  }

  const fiscal = consumed.rows.filter(c => c.fiscal_event_type !== 'NONE');
  const c0 = chain.rows[0] ?? {};
  return {
    transaction: tx,
    fifo: {
      consumed: consumed.rows.map(c => ({
        id: c.id, lot_id: c.lot_id, asset: c.asset, wallet_name: c.wallet_name,
        origin: { id: c.origin_id, operation_type: c.origin_type, timestamp: c.origin_timestamp },
        opened_at: c.opened_at, quantity: num(c.quantity_consumed), cost_eur: num(c.cost_basis_consumed_eur),
        proceeds_eur: num(c.proceeds_eur), gain_loss_eur: num(c.gain_loss_eur), fiscal_event_type: c.fiscal_event_type,
      })),
      totals: {
        cost_eur: fiscal.reduce((s, c) => s + Number(c.cost_basis_consumed_eur), 0),
        proceeds_eur: fiscal.reduce((s, c) => s + Number(c.proceeds_eur), 0),
        gain_loss_eur: fiscal.reduce((s, c) => s + Number(c.gain_loss_eur), 0),
      },
      opened: opened.rows.map(l => ({
        id: l.id, asset: l.asset, wallet_name: l.wallet_name, opened_at: l.opened_at, is_closed: l.is_closed,
        quantity_original: num(l.quantity_original), quantity_remaining: num(l.quantity_remaining),
        price_per_unit_eur: num(l.price_per_unit_eur), fee_eur: num(l.fee_eur),
        consumed_by: later.filter(c => c.lot_id === l.id).map(c => ({
          transaction_id: c.tx_id, operation_type: c.operation_type, timestamp: c.timestamp,
          quantity: num(c.quantity_consumed), proceeds_eur: num(c.proceeds_eur), gain_loss_eur: num(c.gain_loss_eur),
          fiscal_event_type: c.fiscal_event_type,
        })),
      })),
    },
    origin: {
      import: origin.rows[0] ?? null,
      source_rows: Number(raw.rows[0]?.n ?? 0),
      // Filas tal como venían en el CSV (#374); null si se importó antes.
      original_rows: (raw.rows[0]?.originals ?? []).length > 0
        ? originalRowsTable(origin.rows[0]?.exchange ?? null, raw.rows[0].originals)
        : null,
    },
    onchain: {
      tx_hash: c0.tx_hash ?? null,
      address: c0.counterparty_address ?? null,
      network: c0.network ?? null,
      tx_url: explorerUrl(c0.explorer_tx_url ?? null, '{tx_hash}', c0.tx_hash ?? null),
      address_url: explorerUrl(c0.explorer_url ?? null, '{address}', c0.counterparty_address ?? null),
    },
    fiscal_years: [...years].sort(),
  };
}
