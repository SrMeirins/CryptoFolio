import { Router, Request, Response } from 'express';
import { db } from '../../db/client';

const router = Router();

// ── GET /api/transactions/stats ───────────────────────────────────────────
router.get('/stats', async (_req: Request, res: Response) => {
  const [totalsRes, monthlyRes, topAssetsRes, feesRes] = await Promise.all([
    db.query(`
      SELECT
        COUNT(*)::int                                                                  AS total_ops,
        COUNT(DISTINCT asset)::int                                                     AS unique_assets,
        COALESCE(SUM(CASE WHEN cost_asset='EUR' AND operation_type='BUY' THEN cost_amount ELSE 0 END), 0) AS total_invested,
        COUNT(CASE WHEN operation_type IN ('FEE_EXCHANGE','FEE_NETWORK','FEE') THEN 1 END)::int           AS total_fee_ops,
        COALESCE(SUM(
          CASE
            WHEN fee_asset = 'EUR'                                  THEN fee_amount
            WHEN fee_asset = asset AND price_per_unit IS NOT NULL   THEN fee_amount * price_per_unit
            ELSE 0
          END
        ), 0)::float                                                                   AS total_fees_eur,
        COUNT(CASE WHEN operation_type = 'BUY' THEN 1 END)::int                       AS total_buys,
        COUNT(CASE WHEN operation_type = 'SELL' THEN 1 END)::int                      AS total_sells,
        COUNT(CASE WHEN manually_added = true THEN 1 END)::int                        AS total_manual
      FROM transactions
    `),
    db.query(`
      SELECT
        TO_CHAR(DATE_TRUNC('month', timestamp), 'YYYY-MM') AS mes,
        COUNT(*)::int AS total_ops,
        COUNT(CASE WHEN operation_type IN ('BUY','BUY_FIAT','BUY_CRYPTO')                                        THEN 1 END)::int AS compras,
        COUNT(CASE WHEN operation_type IN ('SELL','SELL_FIAT','SELL_CRYPTO','GIFT_SENT','LOST')                   THEN 1 END)::int AS ventas,
        COUNT(CASE WHEN operation_type IN ('STAKING_REWARD','MINING_REWARD','LENDING_INTEREST','LENDING_INTEREST_LOCKED','CASHBACK','AIRDROP','FORK') THEN 1 END)::int AS ingresos,
        COUNT(CASE WHEN operation_type IN ('TRANSFER_INTERNAL','WITHDRAW','WITHDRAW_FIAT','DEPOSIT_FIAT','DEPOSIT_CRYPTO') THEN 1 END)::int AS transferencias,
        COALESCE(SUM(CASE WHEN cost_asset='EUR' AND operation_type IN ('BUY','BUY_FIAT','BUY_CRYPTO') THEN cost_amount ELSE 0 END), 0)::float AS eur_invertido
      FROM transactions
      WHERE timestamp >= NOW() - INTERVAL '18 months'
      GROUP BY DATE_TRUNC('month', timestamp)
      ORDER BY DATE_TRUNC('month', timestamp) ASC
    `),
    db.query(`
      SELECT asset, COUNT(*)::int AS ops,
        COALESCE(SUM(CASE WHEN cost_asset='EUR' THEN cost_amount ELSE 0 END), 0)::float AS eur_volume
      FROM transactions
      WHERE operation_type IN ('BUY','SELL','BUY_FIAT','SELL_FIAT','BUY_CRYPTO','SELL_CRYPTO')
        AND timestamp >= NOW() - INTERVAL '1 year'
      GROUP BY asset ORDER BY ops DESC LIMIT 10
    `),
    db.query(`
      SELECT
        fee_asset AS asset,
        COUNT(*)::int AS ops,
        COALESCE(SUM(fee_amount), 0)::float AS total_amount,
        COALESCE(SUM(
          CASE
            WHEN fee_asset = 'EUR'                                THEN fee_amount
            WHEN fee_asset = asset AND price_per_unit IS NOT NULL THEN fee_amount * price_per_unit
            ELSE 0
          END
        ), 0)::float AS total_eur
      FROM transactions
      WHERE fee_asset IS NOT NULL AND fee_amount > 0
        AND timestamp >= NOW() - INTERVAL '1 year'
      GROUP BY fee_asset ORDER BY total_eur DESC LIMIT 6
    `),
  ]);

  res.json({
    totals:    totalsRes.rows[0],
    monthly:   monthlyRes.rows,
    topAssets: topAssetsRes.rows,
    fees:      feesRes.rows,
  });
});

// ── GET /api/transactions ──────────────────────────────────────────────────
router.get('/', async (req: Request, res: Response) => {
  const {
    asset, type, wallet_id, account, manually_added,
    date_from, date_to, search,
    limit = '50', offset = '0',
  } = req.query;

  let where = 'WHERE 1=1';
  const params: unknown[] = [];
  let paramIdx = 1;

  if (asset)          { where += ` AND t.asset = $${paramIdx++}`;           params.push((asset as string).toUpperCase()); }
  if (type)           { where += ` AND t.operation_type = $${paramIdx++}`;  params.push(type); }
  if (wallet_id)      { where += ` AND t.wallet_id = $${paramIdx++}`;       params.push(wallet_id); }
  if (account)        { where += ` AND t.account = $${paramIdx++}`;         params.push(account); }
  if (date_from)      { where += ` AND t.timestamp >= $${paramIdx++}`;      params.push(date_from); }
  if (date_to)        { where += ` AND t.timestamp <= $${paramIdx++}`;      params.push(`${date_to}T23:59:59Z`); }
  if (search) {
    where += ` AND (t.notes ILIKE $${paramIdx} OR t.asset ILIKE $${paramIdx})`;
    params.push(`%${(search as string)}%`);
    paramIdx++;
  }
  if (manually_added !== undefined) {
    where += ` AND t.manually_added = $${paramIdx++}`;
    params.push(manually_added === 'true');
  }

  params.push(parseInt(limit as string));
  params.push(parseInt(offset as string));

  const result = await db.query(
    `SELECT
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
       lt.asset AS linked_tx_asset
     FROM transactions t
     JOIN wallets w ON w.id = t.wallet_id
     LEFT JOIN wallets dw ON dw.id = t.destination_wallet_id
     LEFT JOIN transactions lt ON lt.id = t.linked_tx_id
     ${where}
     ORDER BY t.timestamp DESC
     LIMIT $${paramIdx++} OFFSET $${paramIdx}`,
    params
  );

  const filterParams = params.slice(0, -2);
  const [totalRes, sumRes] = await Promise.all([
    db.query(
      `SELECT COUNT(*) FROM transactions t JOIN wallets w ON w.id = t.wallet_id ${where}`,
      filterParams
    ),
    db.query(
      `SELECT COALESCE(SUM(
         CASE
           WHEN t.cost_asset = 'EUR' THEN ABS(t.cost_amount)
           WHEN t.price_per_unit IS NOT NULL THEN ABS(t.amount_net) * t.price_per_unit
           ELSE 0
         END
       ), 0)::float AS total_eur
       FROM transactions t JOIN wallets w ON w.id = t.wallet_id ${where}`,
      filterParams
    ),
  ]);

  res.json({
    transactions: result.rows,
    total:     parseInt(totalRes.rows[0].count),
    total_eur: sumRes.rows[0].total_eur,
    limit:     parseInt(limit as string),
    offset:    parseInt(offset as string),
  });
});

export default router;
