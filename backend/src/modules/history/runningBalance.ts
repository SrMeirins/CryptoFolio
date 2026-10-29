import { EUR_MOVEMENTS_SQL } from '../fiat/eurMovements';
import { fifoOrderBy } from '../fifo/orderSql';
import { FEE_PARENT_CTES } from './feeGrouping';

// Saldo corrido de un activo en el Historial (#380): cantidad que queda tras
// cada operación, acumulando todo su historial (los filtros de la vista solo
// eligen qué filas se ven). Las cantidades salen de los lotes FIFO (lo que
// abre cada transacción menos lo que consume, como Portfolio), en el orden del
// motor; el EUR, de la definición común de movimientos de euros. Con una
// wallet, el saldo es el de esa wallet.

/** Lo mínimo para consultar: el `db` de la app, un Pool o un cliente. */
type Queryable = { query: (text: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> };

export interface RunningBalanceRow {
  id: string
  /** Saldo tras la operación (y sus comisiones agrupadas, si se agrupan). */
  balance: number
  /** Cantidad que faltaba en lotes al procesarla; null si no hubo déficit. */
  missing: number | null
}

export interface RunningBalance {
  asset: string
  wallet_id: string | null
  /** Saldo actual (tras la última operación); cuadra con Portfolio. */
  current: number
  rows: RunningBalanceRow[]
  /** Operaciones con déficit en todo el historial del activo, y la más antigua. */
  shortfalls: { count: number; first_id: string | null }
}

const FIAT_BALANCE_ASSET = 'EUR';
/** Cantidad sin ruido de coma flotante: 12 decimales y el polvo (< 1e-9) a 0. */
function qty(v: unknown): number {
  const n = v === null || v === undefined ? 0 : Number(v);
  return Math.abs(n) < 1e-9 ? 0 : Number(n.toFixed(12));
}

/** Movimientos (id, delta) del activo: FIFO o, para EUR, sus movimientos comunes. */
function deltasSql(asset: string, walletParam: string | null): string {
  const wallet = (col: string) => (walletParam ? `AND ${col} = ${walletParam}` : '');
  if (asset === FIAT_BALANCE_ASSET) {
    return `SELECT m.id AS tx_id, SUM(m.amount) AS d FROM (${EUR_MOVEMENTS_SQL}) m WHERE TRUE ${wallet('m.wallet_id')} GROUP BY m.id`;
  }
  return `
    SELECT tx_id, SUM(d) AS d FROM (
      SELECT fl.open_transaction_id AS tx_id, fl.quantity_original AS d
      FROM fifo_lots fl WHERE fl.asset = $1 ${wallet('fl.wallet_id')}
      UNION ALL
      SELECT c.consuming_transaction_id, -c.quantity_consumed
      FROM fifo_lot_consumptions c JOIN fifo_lots fl ON fl.id = c.lot_id
      WHERE fl.asset = $1 ${wallet('fl.wallet_id')}
    ) x GROUP BY tx_id`;
}

/**
 * Saldo tras cada operación de `ids` (las filas de la página) y el resumen del
 * activo. `groupFees`: el saldo de una compra o venta incluye sus comisiones
 * agrupadas (#371), que el motor procesa justo después en el mismo instante.
 */
export async function getRunningBalance(
  db: Queryable, asset: string, walletId: string | null, ids: readonly string[], groupFees: boolean,
): Promise<RunningBalance> {
  const params: unknown[] = [asset];
  let walletParam: string | null = null;
  if (walletId) { params.push(walletId); walletParam = `$${params.length}`; }
  params.push(ids);
  const idsParam = `$${params.length}`;
  const shortWallet = walletParam ? `AND s.wallet_id = ${walletParam}` : '';

  const { rows } = await db.query(
    `WITH deltas AS (${deltasSql(asset, walletParam)}),
     -- Toda operación que toca el activo tiene saldo, aunque no lo mueva (p. ej.
     -- un retiro con destino pendiente repite el anterior).
     touching AS (
       SELECT t.id, t.timestamp, t.created_at, t.operation_type FROM transactions t
       WHERE (t.asset = $1 OR t.cost_asset = $1 OR t.fee_asset = $1 OR t.id IN (SELECT tx_id FROM deltas))
     ),
     ordered AS (
       SELECT t.id,
         SUM(COALESCE(d.d, 0)) OVER (ORDER BY ${fifoOrderBy('t')}, t.id ROWS UNBOUNDED PRECEDING) AS balance,
         ROW_NUMBER() OVER (ORDER BY ${fifoOrderBy('t')}, t.id) AS seq
       FROM touching t LEFT JOIN deltas d ON d.tx_id = t.id
     ),
     ${FEE_PARENT_CTES},
     -- Saldo mostrado: el de la última operación de su grupo (ella y sus comisiones).
     shown AS (
       SELECT o.id, ${groupFees ? `(SELECT g.balance FROM ordered g
           WHERE g.id = o.id OR g.id IN (SELECT fp.fee_id FROM fee_parent fp WHERE fp.parent_id = o.id)
           ORDER BY g.seq DESC LIMIT 1)` : 'o.balance'} AS balance
       FROM ordered o WHERE o.id = ANY(${idsParam}::uuid[])
     ),
     short AS (
       SELECT s.transaction_id AS id, SUM(s.missing) AS missing FROM fifo_shortfalls s
       WHERE s.asset = $1 ${shortWallet} GROUP BY s.transaction_id
     )
     SELECT
       (SELECT balance FROM ordered ORDER BY seq DESC LIMIT 1) AS current,
       (SELECT COALESCE(json_agg(json_build_object('id', sh.id, 'balance', sh.balance, 'missing', s.missing)), '[]')
        FROM shown sh LEFT JOIN short s ON s.id = sh.id) AS rows,
       (SELECT COUNT(*) FROM short) AS short_count,
       (SELECT s.id FROM short s JOIN transactions t ON t.id = s.id ORDER BY t.timestamp, t.id LIMIT 1) AS short_first`,
    params,
  );
  const r = rows[0];
  return {
    asset,
    wallet_id: walletId,
    current: qty(r.current),
    rows: (r.rows as { id: string; balance: unknown; missing: unknown }[]).map(x => ({
      id: x.id, balance: qty(x.balance), missing: x.missing === null ? null : qty(x.missing),
    })),
    shortfalls: { count: Number(r.short_count), first_id: (r.short_first as string | null) ?? null },
  };
}
