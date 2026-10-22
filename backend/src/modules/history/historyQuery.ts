import { usdPerEurSql } from '../fiat/displayCurrency';
import { buildHistoryOrderBy, buildHistoryWhere, HistoryFilters } from './listFilters';
import { FLOW_DIRECTION, VALUATION_COLUMNS, VALUATION_CTES, valuationJoins } from './valuationSql';

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

type Filters = HistoryFilters & { sort: HistoryFilters['sort']; dir: HistoryFilters['dir'] };

/**
 * CTEs con lo filtrado y valorado (#366): `filtered` trae cada transacción con
 * su valoración y su sentido (entrada/salida). El rango de importe se aplica
 * después de valorar, en la moneda pedida (en USD, con el tipo de su fecha);
 * con rango, las filas sin precio quedan fuera. Lo usan la página, los totales
 * y el CSV, así que todos respetan los mismos filtros.
 */
export function filteredValuedCtes(f: Filters, tz: string): { ctes: string; params: unknown[] } {
  const { where, params } = buildHistoryWhere(f, tz);
  const all = [...params, tz];
  const tzParam = `$${all.length}`;
  const ranged = f.value_min !== undefined || f.value_max !== undefined;
  const display = f.currency === 'USD' ? `t.value_eur * (${usdPerEurSql('t.timestamp')})` : 't.value_eur';
  const range: string[] = [];
  if (f.value_min !== undefined) { all.push(f.value_min); range.push(`${display} >= $${all.length}`); }
  if (f.value_max !== undefined) { all.push(f.value_max); range.push(`${display} <= $${all.length}`); }
  const ctes = `
    ${VALUATION_CTES},
    valued AS (
      SELECT t.*, ${VALUATION_COLUMNS}, ${FLOW_DIRECTION}
      FROM transactions t ${valuationJoins(tzParam)}
      ${where}
    ),
    filtered AS (
      SELECT t.* FROM valued t
      ${ranged ? `WHERE ${range.join(' AND ')}` : ''}
    )`;
  return { ctes, params: all };
}

/**
 * SQL y parámetros de las filas filtradas y ordenadas. Con `page`, añade
 * LIMIT/OFFSET como parámetros; sin él devuelve todas (para un cursor).
 */
export function historyRowsSql(f: Filters, tz: string, page?: { limit: number; offset: number }): { sql: string; params: unknown[] } {
  const { ctes, params } = filteredValuedCtes(f, tz);
  const all = [...params];
  let paging = '';
  if (page) {
    all.push(page.limit, page.offset);
    paging = `LIMIT $${all.length - 1} OFFSET $${all.length}`;
  }
  const sql = `
    WITH ${ctes},
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
