import { Router } from 'express';
import { db } from '../../db/client';

const router = Router();

// GET /api/fifo/summary — Resumen fiscal por año
router.get('/summary', async (_req, res) => {
  const result = await db.query('SELECT * FROM v_fiscal_year ORDER BY fiscal_year');
  res.json(result.rows);
});

// GET /api/fifo/fiat-balances — Saldo de activos fiat (EUR) por wallet
// Calcula: depósitos + conversiones cripto→EUR - compras con EUR - retiradas
router.get('/fiat-balances', async (_req, res) => {
  const FIAT_ASSETS = ['EUR'];
  // EUR balance neto por wallet: suma de todos los flujos EUR (en/out) por wallet.
  // Se combinan las dos "perspectivas" del EUR: cuando es asset directo (depósito,
  // recepción de venta cripto→EUR) y cuando es cost_asset (pago por compra de cripto).
  const fiatClause = FIAT_ASSETS.map((_, i) => `$${i + 1}`).join(', ');
  // EUR es fungible entre sub-wallets (Spot, Funding…) → agrupamos por wallet_kind.
  // Solo se consideran salidas de EUR desde la fecha del primer depósito registrado:
  // los gastos previos al CSV se financiaron con depósitos externos no rastreados.
  const result = await db.query(
    `WITH fiat_flows AS (
       -- Flujos donde EUR es el activo directo (depósitos, retiradas, conversiones cripto→EUR)
       SELECT w.type AS wallet_kind, asset AS fiat_asset,
              CASE
                WHEN operation_type = 'DEPOSIT_FIAT'  THEN  amount
                WHEN operation_type = 'BUY'           THEN  amount_net
                WHEN operation_type = 'WITHDRAW_FIAT' THEN -amount
                WHEN operation_type = 'CASHBACK'      THEN  amount_net
                ELSE 0
              END AS flow
       FROM transactions t JOIN wallets w ON w.id = t.wallet_id
       WHERE asset IN (${fiatClause})
         AND operation_type IN ('DEPOSIT_FIAT', 'BUY', 'WITHDRAW_FIAT', 'CASHBACK')

       UNION ALL

       -- Flujos donde EUR es el activo de coste (pagos con EUR para BUY, EUR recibido en SELL)
       SELECT w.type AS wallet_kind, cost_asset AS fiat_asset,
              CASE
                WHEN operation_type IN ('BUY','BUY_FIAT','BUY_CRYPTO','FEE_EXCHANGE') THEN -COALESCE(cost_amount, 0)
                WHEN operation_type IN ('SELL','SELL_FIAT')                           THEN  COALESCE(cost_amount, 0)
                ELSE 0
              END AS flow
       FROM transactions t
       JOIN wallets w ON w.id = t.wallet_id
       WHERE cost_asset IN (${fiatClause})
         AND operation_type IN ('BUY','BUY_FIAT','BUY_CRYPTO','SELL','SELL_FIAT','FEE_EXCHANGE')
     ),
     wallet_rep AS (
       -- Wallet representante de cada tipo (la que tiene el depósito fiat = la principal)
       SELECT DISTINCT ON (type)
         id, name, color, type
       FROM wallets
       WHERE is_system = TRUE
       ORDER BY type,
         CASE WHEN name ILIKE '%spot%' THEN 0 WHEN name ILIKE '%funding%' THEN 1 ELSE 2 END
     )
     SELECT
       wr.id    AS wallet_id,
       wr.name  AS wallet_name,
       wr.color AS wallet_color,
       wr.type  AS wallet_kind,
       f.fiat_asset AS asset,
       ROUND(SUM(f.flow)::numeric, 2) AS balance
     FROM fiat_flows f
     JOIN wallet_rep wr ON wr.type = f.wallet_kind
     GROUP BY wr.id, wr.name, wr.color, wr.type, f.fiat_asset
     HAVING ROUND(SUM(f.flow)::numeric, 2) > 0.005
     ORDER BY balance DESC`,
    FIAT_ASSETS
  );
  res.json(result.rows);
});

// GET /api/fifo/eur-flow — Euros depositados, retirados y neto invertido en cripto
router.get('/eur-flow', async (_req, res) => {
  const result = await db.query(`
    SELECT
      COALESCE(SUM(CASE WHEN operation_type = 'DEPOSIT_FIAT'  AND asset = 'EUR' THEN amount     ELSE 0 END), 0) AS deposited,
      COALESCE(SUM(CASE WHEN operation_type = 'WITHDRAW_FIAT' AND asset = 'EUR' THEN amount     ELSE 0 END), 0) AS withdrawn,
      COALESCE(SUM(CASE WHEN operation_type IN ('BUY','BUY_FIAT') AND cost_asset = 'EUR'        THEN cost_amount ELSE 0 END), 0) AS eur_spent_buying,
      COALESCE(SUM(CASE WHEN operation_type IN ('SELL','SELL_FIAT') AND cost_asset = 'EUR'      THEN cost_amount ELSE 0 END), 0) AS eur_received_selling
    FROM transactions
  `);
  const row = result.rows[0];
  const deposited          = parseFloat(row.deposited);
  const withdrawn          = parseFloat(row.withdrawn);
  const eurSpentBuying     = parseFloat(row.eur_spent_buying);
  const eurReceivedSelling = parseFloat(row.eur_received_selling);
  res.json({
    deposited,
    withdrawn,
    netFromBank: deposited - withdrawn,         // EUR neto desde el banco
    eurSpentBuying,
    eurReceivedSelling,
    netInvested: eurSpentBuying - eurReceivedSelling,  // EUR neto gastado en cripto
  });
});

// GET /api/fifo/realized-pnl — P&L realizado histórico por activo
router.get('/realized-pnl', async (_req, res) => {
  const result = await db.query(`
    SELECT
      fl.asset,
      COUNT(flc.id)::int                                                              AS operations,
      ROUND(SUM(CASE WHEN flc.gain_loss_eur > 0 THEN flc.gain_loss_eur ELSE 0 END)::numeric, 2) AS realized_gains,
      ROUND(SUM(CASE WHEN flc.gain_loss_eur < 0 THEN flc.gain_loss_eur ELSE 0 END)::numeric, 2) AS realized_losses,
      ROUND(SUM(flc.gain_loss_eur)::numeric, 2)                                       AS net_pnl,
      ROUND(SUM(flc.quantity_consumed)::numeric, 8)                                   AS total_sold,
      MIN(flc.consumed_at)::date                                                       AS first_sale,
      MAX(flc.consumed_at)::date                                                       AS last_sale
    FROM fifo_lot_consumptions flc
    JOIN fifo_lots fl ON fl.id = flc.lot_id
    WHERE flc.fiscal_event_type != 'NONE'
    GROUP BY fl.asset
    ORDER BY net_pnl ASC
  `);

  const rows = result.rows;
  const totalGains  = rows.reduce((s: number, r: { realized_gains: string }) => s + parseFloat(r.realized_gains), 0);
  const totalLosses = rows.reduce((s: number, r: { realized_losses: string }) => s + parseFloat(r.realized_losses), 0);
  const netPnl      = totalGains + totalLosses;

  res.json({ totalGains, totalLosses, netPnl, byAsset: rows });
});

// GET /api/fifo/lots — Lotes FIFO abiertos actualmente
router.get('/lots', async (_req, res) => {
  const result = await db.query(
    `SELECT
       fl.asset,
       fl.wallet_id,
       w.name  AS wallet_name,
       w.color AS wallet_color,
       w.type  AS wallet_kind,
       SUM(fl.quantity_remaining)  AS quantity,
       SUM(fl.cost_basis_eur)      AS cost_basis_eur,
       -- Media ponderada por cantidad (no media simple)
       SUM(fl.quantity_remaining * fl.price_per_unit_eur)
         / NULLIF(SUM(fl.quantity_remaining), 0) AS avg_price_eur
     FROM fifo_lots fl
     JOIN wallets w ON w.id = fl.wallet_id
     WHERE fl.is_closed = FALSE AND fl.quantity_remaining > 0
     GROUP BY fl.asset, fl.wallet_id, w.name, w.color, w.type
     ORDER BY fl.asset, w.name`
  );
  res.json(result.rows);
});

// GET /api/fifo/locked — Cantidades netas bloqueadas en staking/launchpool (LOCK - UNLOCK) por wallet+activo
router.get('/locked', async (_req, res) => {
  const result = await db.query(
    `SELECT
       wallet_id,
       wallet_name,
       wallet_color,
       asset,
       staking_type,
       lock_kind,
       SUM(CASE WHEN op IN ('STAKING_LOCK','LAUNCHPOOL_LOCK')     THEN amount_net ELSE 0 END)
     - SUM(CASE WHEN op IN ('STAKING_UNLOCK','LAUNCHPOOL_UNLOCK') THEN amount_net ELSE 0 END) AS locked_amount
     FROM (
       SELECT t.wallet_id, w.name AS wallet_name, w.color AS wallet_color,
              t.asset, t.operation_type AS op, t.amount_net,
              -- Para UNLOCKs usamos las notes del LOCK enlazado (linked_tx_id) en lugar de
              -- las del propio UNLOCK. Binance renombra productos a mitad de ciclo
              -- (ej. "Staking Purchase" → redimido como "Simple Earn Locked Redemption"),
              -- así que el UNLOCK tiene notes distintas al LOCK, y sin este join no se
              -- cancelarían en el GROUP BY.
              CASE t.operation_type
                WHEN 'STAKING_LOCK'      THEN t.notes
                WHEN 'STAKING_UNLOCK'    THEN COALESCE(
                  (SELECT t2.notes FROM transactions t2 WHERE t2.id = t.linked_tx_id),
                  t.notes
                )
                WHEN 'LAUNCHPOOL_LOCK'   THEN t.notes
                WHEN 'LAUNCHPOOL_UNLOCK' THEN COALESCE(
                  (SELECT t2.notes FROM transactions t2 WHERE t2.id = t.linked_tx_id),
                  t.notes
                )
              END AS staking_type,
              CASE WHEN t.operation_type IN ('LAUNCHPOOL_LOCK','LAUNCHPOOL_UNLOCK')
                   THEN 'launchpool' ELSE 'staking' END AS lock_kind
       FROM transactions t
       JOIN wallets w ON w.id = t.wallet_id
       WHERE t.operation_type IN ('STAKING_LOCK','STAKING_UNLOCK','LAUNCHPOOL_LOCK','LAUNCHPOOL_UNLOCK')
     ) sub
     GROUP BY wallet_id, wallet_name, wallet_color, asset, staking_type, lock_kind
     HAVING SUM(CASE WHEN op IN ('STAKING_LOCK','LAUNCHPOOL_LOCK')     THEN amount_net ELSE 0 END)
          - SUM(CASE WHEN op IN ('STAKING_UNLOCK','LAUNCHPOOL_UNLOCK') THEN amount_net ELSE 0 END) > 0.000001
     ORDER BY asset, wallet_name`
  );
  res.json(result.rows);
});

export default router;
