import { Router } from 'express';
import { db } from '../../db/client';
import { EUR_MOVEMENTS_SQL } from '../../modules/fiat/eurMovements';
import { currencySchema, fxSql } from '../../modules/fiat/displayCurrency';

const router = Router();

// GET /api/fifo/summary — Resumen fiscal por año
router.get('/summary', async (_req, res) => {
  const result = await db.query('SELECT * FROM v_fiscal_year ORDER BY fiscal_year');
  res.json(result.rows);
});

// GET /api/fifo/fiat-balances — Saldo de activos fiat (EUR) por wallet
// Calcula: depósitos + conversiones cripto→EUR - compras con EUR - retiradas
router.get('/fiat-balances', async (_req, res) => {
  // EUR es fungible entre sub-wallets (Spot, Funding…) → se agrupa por tipo de
  // wallet y se muestra en la wallet representante. Movimientos: EUR_MOVEMENTS_SQL.
  const result = await db.query(
    `WITH movements AS (${EUR_MOVEMENTS_SQL}),
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
       'EUR'    AS asset,
       ROUND(SUM(m.amount)::numeric, 2) AS balance
     FROM movements m
     JOIN wallets w ON w.id = m.wallet_id
     JOIN wallet_rep wr ON wr.type = w.type
     GROUP BY wr.id, wr.name, wr.color, wr.type
     HAVING ROUND(SUM(m.amount)::numeric, 2) > 0.005
     ORDER BY balance DESC`,
  );
  res.json(result.rows);
});

// GET /api/fifo/eur-flow — Euros depositados, retirados y neto invertido en cripto
router.get('/eur-flow', async (req, res) => {
  // Movimientos de EUR: EUR_MOVEMENTS_SQL. Comprar cripto con EUR incluye las
  // ventas cuyo activo es EUR; recibir EUR incluye las compras de EUR.
  // ?currency=USD convierte cada movimiento con el tipo de su fecha (#175).
  const currency = currencySchema.safeParse(req.query.currency);
  if (!currency.success) { res.status(400).json({ error: 'currency debe ser EUR o USD' }); return; }
  const fx = fxSql(currency.data, 'timestamp');
  const result = await db.query(`
    SELECT
      COALESCE(SUM(CASE WHEN kind = 'deposit'                       THEN  amount * fx ELSE 0 END), 0) AS deposited,
      COALESCE(SUM(CASE WHEN kind = 'withdraw'                      THEN -amount * fx ELSE 0 END), 0) AS withdrawn,
      COALESCE(SUM(CASE WHEN kind IN ('buy', 'eur_to_crypto')       THEN -amount * fx ELSE 0 END), 0) AS eur_spent_buying,
      COALESCE(SUM(CASE WHEN kind IN ('sell', 'crypto_to_eur')      THEN  amount * fx ELSE 0 END), 0) AS eur_received_selling
    FROM (SELECT m.*, ${fx} AS fx FROM (${EUR_MOVEMENTS_SQL}) m) movements
  `);
  const row = result.rows[0];
  const deposited          = parseFloat(row.deposited);
  const withdrawn          = parseFloat(row.withdrawn);
  const eurSpentBuying     = parseFloat(row.eur_spent_buying);
  const eurReceivedSelling = parseFloat(row.eur_received_selling);
  res.json({
    currency: currency.data,
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
         / NULLIF(SUM(fl.quantity_remaining), 0) AS avg_price_eur,
       -- Coste en USD con el tipo de apertura de cada lote (#174/#175). NULL si
       -- algún lote del grupo no tiene tipo: SUM descartaría ese lote y daría un
       -- coste incompleto (#182); el frontend recurre entonces al tipo en vivo.
       CASE WHEN bool_and(fl.usd_per_eur IS NOT NULL)
            THEN SUM(fl.cost_basis_eur * fl.usd_per_eur) END AS cost_basis_usd,
       CASE WHEN bool_and(fl.usd_per_eur IS NOT NULL)
            THEN SUM(fl.quantity_remaining * fl.price_per_unit_eur * fl.usd_per_eur)
                 / NULLIF(SUM(fl.quantity_remaining), 0) END AS avg_price_usd,
       -- Fecha media de apertura ponderada por el coste restante (#283); si
       -- todo el grupo tiene coste 0 (airdrops), media por cantidad.
       to_timestamp(COALESCE(
         SUM(fl.quantity_remaining * fl.price_per_unit_eur * EXTRACT(EPOCH FROM fl.opened_at))
           / NULLIF(SUM(fl.quantity_remaining * fl.price_per_unit_eur), 0),
         SUM(fl.quantity_remaining * EXTRACT(EPOCH FROM fl.opened_at)) / NULLIF(SUM(fl.quantity_remaining), 0)
       )::double precision) AS avg_opened_at
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
