import { usdPerEurSql } from '../fiat/displayCurrency';
import { buildHistoryOrderBy, buildHistoryWhere, HistoryFilters } from './listFilters';
import { VALUATION_COLUMNS, VALUATION_CTES, valuationJoins } from './valuationSql';

// Consulta de filas del Historial (#346/#349), común al listado paginado y a
// la exportación CSV: filtra, valora todo lo filtrado (para poder ordenar por
// valor antes de paginar) y ordena con la lista blanca de buildHistoryOrderBy.

const ROW_COLUMNS = `
  t.id, t.operation_type, t.timestamp, t.asset, t.amount, t.amount_net,
  t.cost_asset, t.cost_amount, t.price_per_unit,
  t.fee_asset, t.fee_amount,
  t.wallet_id, w.name AS wallet_name, w.color AS wallet_color, w.type AS wallet_kind,
  t.account, t.destination_wallet_id,
  dw.name AS destination_wallet_name, dw.color AS destination_wallet_color,
  t.destination_pending, t.notes, t.manually_added, t.created_at,
  t.linked_tx_id,
  lt.timestamp AS linked_tx_timestamp,
  lt.operation_type AS linked_tx_operation_type,
  lt.amount AS linked_tx_amount,
  lt.asset AS linked_tx_asset,
  t.import_id, ci.filename AS import_filename, t.tx_hash,
  t.value_eur, t.value_source, t.fee_value_eur, t.fee_value_source`;

/**
 * SQL y parámetros de las filas filtradas y ordenadas. Con `page`, añade
 * LIMIT/OFFSET como parámetros; sin él devuelve todas (para un cursor).
 */
export function historyRowsSql(
  f: HistoryFilters & { sort: HistoryFilters['sort']; dir: HistoryFilters['dir'] },
  tz: string,
  page?: { limit: number; offset: number },
): { sql: string; params: unknown[] } {
  const { where, params } = buildHistoryWhere(f, tz);
  const all = [...params, tz];
  const tzParam = `$${all.length}`;
  let paging = '';
  if (page) {
    all.push(page.limit, page.offset);
    paging = `LIMIT $${all.length - 1} OFFSET $${all.length}`;
  }
  const sql = `
    WITH ${VALUATION_CTES},
    filtered AS (
      SELECT t.*, ${VALUATION_COLUMNS}
      FROM transactions t ${valuationJoins(tzParam)}
      ${where}
    ),
    ordered AS (
      SELECT t.* FROM filtered t
      ${buildHistoryOrderBy(f.sort, f.dir)}
      ${paging}
    )
    SELECT ${ROW_COLUMNS},
      ${usdPerEurSql('t.timestamp')} AS usd_per_eur
    FROM ordered t
    JOIN wallets w ON w.id = t.wallet_id
    LEFT JOIN wallets dw ON dw.id = t.destination_wallet_id
    LEFT JOIN transactions lt ON lt.id = t.linked_tx_id
    LEFT JOIN csv_imports ci ON ci.id = t.import_id
    ${buildHistoryOrderBy(f.sort, f.dir)}`;
  return { sql, params: all };
}
