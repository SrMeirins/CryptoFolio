import { Router, Request, Response } from 'express';
import { db } from '../db/client';
import { runFifoEngine } from '../modules/fifo/engine';
import { getHistoricalPriceEur } from '../modules/prices/binance';

const router = Router();

// Ops que no generan precio histórico (coste 0 por ley)
const ZERO_COST_OPS = new Set(['FORK']);
// Ops que consumen lotes (para preview)
const CONSUME_OPS = new Set(['SELL', 'SELL_FIAT', 'SELL_CRYPTO', 'GIFT_SENT', 'LOST', 'FEE_NETWORK', 'FEE_EXCHANGE']);
// Ops que crean lotes
const OPEN_LOT_OPS = new Set(['BUY', 'BUY_FIAT', 'BUY_CRYPTO', 'AIRDROP', 'DEPOSIT_CRYPTO', 'FORK', 'STAKING_REWARD', 'MINING_REWARD', 'LENDING_INTEREST', 'LENDING_INTEREST_LOCKED', 'CASHBACK']);

// ── POST /api/transactions/manual/preview ──────────────────────────────────
router.post('/manual/preview', async (req: Request, res: Response) => {
  const {
    operationType, asset, amount, costAsset, costAmount,
    timestamp, wallet_id, destinationWalletId, feeAsset, feeAmount,
  } = req.body;

  const isFeeOp = operationType === 'FEE_NETWORK' || operationType === 'FEE_EXCHANGE';
  const resolvedAsset  = isFeeOp ? (feeAsset  ?? asset)  : asset;
  const resolvedAmount = isFeeOp ? (feeAmount ?? amount) : amount;

  if (!operationType || !timestamp) {
    res.status(400).json({ error: 'operationType y timestamp son requeridos' });
    return;
  }

  const date = new Date(timestamp);
  const warnings: string[] = [];

  // Advertencia: fecha en el futuro
  if (date > new Date()) {
    warnings.push('La fecha introducida es futura. Verifica que sea correcta.');
  }

  // Advertencia: solapamiento con imports
  const importRanges = await db.query(
    `SELECT ci.filename, MIN(t.timestamp) as date_from, MAX(t.timestamp) as date_to
     FROM csv_imports ci JOIN transactions t ON t.import_id = ci.id
     GROUP BY ci.id, ci.filename`
  );
  for (const range of importRanges.rows) {
    const from = new Date(range.date_from);
    const to   = new Date(range.date_to);
    if (date >= from && date <= to) {
      warnings.push(
        `La fecha está dentro del rango importado de "${range.filename}" ` +
        `(${from.toISOString().slice(0, 10)} – ${to.toISOString().slice(0, 10)}). ` +
        `Asegúrate de no duplicar la operación.`
      );
    }
  }

  // Advertencia: fecha anterior al último registro → recálculo FIFO completo
  const lastTx = await db.query('SELECT MAX(timestamp) as last_ts FROM transactions');
  if (lastTx.rows[0].last_ts && date < new Date(lastTx.rows[0].last_ts)) {
    warnings.push(
      'Esta fecha es anterior a la última transacción registrada. ' +
      'Se recalcularán todos los lotes FIFO posteriores.'
    );
  }

  // Precio histórico (FORK siempre 0)
  let priceEur: number | null = null;
  if (resolvedAsset && !ZERO_COST_OPS.has(operationType)) {
    try { priceEur = await getHistoricalPriceEur(resolvedAsset, date); } catch { /* ignorar */ }
  }

  let estimatedGainLoss: number | null = null;
  let affectedLots: unknown[] = [];
  let newLot: unknown = null;
  let transferLots: unknown[] = [];

  // Preview de venta / consumo de lotes
  if (CONSUME_OPS.has(operationType) && resolvedAmount && wallet_id) {
    const lots = await db.query(
      `SELECT id, quantity_remaining, cost_basis_eur, price_per_unit_eur, opened_at
       FROM fifo_lots
       WHERE asset = $1 AND wallet_id = $2 AND is_closed = FALSE AND quantity_remaining > 0
       ORDER BY opened_at ASC`,
      [resolvedAsset, wallet_id]
    );

    let proceedsEur = 0;
    if (costAsset === 'EUR' && costAmount) {
      proceedsEur = parseFloat(costAmount);
    } else if (priceEur) {
      proceedsEur = parseFloat(resolvedAmount) * priceEur;
    }

    let remaining = parseFloat(resolvedAmount);
    let totalCost = 0;
    const proceedsPerUnit = remaining > 0 ? proceedsEur / remaining : 0;

    for (const lot of lots.rows) {
      if (remaining <= 0) break;
      const consumed     = Math.min(parseFloat(lot.quantity_remaining), remaining);
      const proportion   = consumed / parseFloat(lot.quantity_remaining);
      const costConsumed = parseFloat(lot.cost_basis_eur) * proportion;
      totalCost += costConsumed;
      remaining -= consumed;
      affectedLots.push({
        lotId: lot.id,
        openedAt: lot.opened_at,
        consumed,
        costConsumed,
        proceedsEur: consumed * proceedsPerUnit,
        pricePerUnit: lot.price_per_unit_eur,
      });
    }

    if (remaining > 0.0001) {
      warnings.push(`Lotes insuficientes: faltan ${remaining.toFixed(6)} ${resolvedAsset ?? ''} en esta wallet.`);
    }

    estimatedGainLoss = proceedsEur - totalCost;
  }

  // Preview de apertura de lote (BUY / income)
  if (OPEN_LOT_OPS.has(operationType) && resolvedAmount) {
    const qty    = parseFloat(resolvedAmount);
    const price  = ZERO_COST_OPS.has(operationType) ? 0 : (priceEur ?? 0);
    const cost   = costAsset === 'EUR' && costAmount ? parseFloat(costAmount) : qty * price;
    newLot = { asset: resolvedAsset, quantity: qty, costBasisEur: cost, pricePerUnit: price };
  }

  // Preview de transferencia: lotes que se moverán
  if (operationType === 'TRANSFER_INTERNAL' && resolvedAmount && wallet_id && destinationWalletId) {
    if (wallet_id === destinationWalletId) {
      warnings.push('El wallet origen y destino son el mismo.');
    } else {
      const lots = await db.query(
        `SELECT quantity_remaining, cost_basis_eur, price_per_unit_eur, opened_at
         FROM fifo_lots
         WHERE asset = $1 AND wallet_id = $2 AND is_closed = FALSE AND quantity_remaining > 0
         ORDER BY opened_at ASC`,
        [resolvedAsset, wallet_id]
      );
      let remaining = parseFloat(resolvedAmount);
      for (const lot of lots.rows) {
        if (remaining <= 0) break;
        const moved = Math.min(parseFloat(lot.quantity_remaining), remaining);
        transferLots.push({ openedAt: lot.opened_at, moved, pricePerUnit: lot.price_per_unit_eur });
        remaining -= moved;
      }
      if (remaining > 0.0001) {
        warnings.push(`Lotes insuficientes para transferir: faltan ${remaining.toFixed(6)} ${resolvedAsset ?? ''}.`);
      }
    }
  }

  res.json({ warnings, priceEur, estimatedGainLoss, affectedLots, newLot, transferLots });
});

// ── POST /api/transactions/manual ─────────────────────────────────────────
router.post('/manual', async (req: Request, res: Response) => {
  const {
    operationType, asset, amount, amountNet,
    costAsset, costAmount, pricePerUnit,
    feeAsset, feeAmount,
    wallet_id, destinationWalletId, timestamp, notes,
  } = req.body;

  const isFeeOp   = operationType === 'FEE_NETWORK' || operationType === 'FEE_EXCHANGE';
  const isIgnored = operationType === 'IGNORED';
  const isFork    = operationType === 'FORK';

  // FEE ops usan fee_asset/fee_amount como campo principal
  const finalAsset  = isFeeOp ? (feeAsset  ?? asset)  : asset;
  const finalAmount = isFeeOp ? (feeAmount ?? amount) : amount;

  if (!operationType || !timestamp) {
    res.status(400).json({ error: 'operationType y timestamp son requeridos' });
    return;
  }
  if (!isIgnored && !isFeeOp && (!finalAsset || !finalAmount)) {
    res.status(400).json({ error: 'asset y amount son requeridos para este tipo de operación' });
    return;
  }
  if (isFeeOp && !finalAsset) {
    res.status(400).json({ error: 'fee_asset es requerido para operaciones de fee' });
    return;
  }

  // Resolver wallet_id
  let resolvedWalletId = wallet_id;
  if (!resolvedWalletId) {
    if (isIgnored) {
      const fallback = await db.query('SELECT id FROM wallets WHERE is_system = TRUE LIMIT 1');
      resolvedWalletId = fallback.rows[0]?.id;
    }
    if (!resolvedWalletId) {
      res.status(400).json({ error: 'wallet_id es requerido' });
      return;
    }
  } else {
    const walletCheck = await db.query('SELECT id FROM wallets WHERE id = $1', [resolvedWalletId]);
    if (walletCheck.rows.length === 0) {
      res.status(400).json({ error: 'wallet_id no existe' });
      return;
    }
  }

  // Validar TRANSFER_INTERNAL
  if (operationType === 'TRANSFER_INTERNAL') {
    if (!destinationWalletId) {
      res.status(400).json({ error: 'destinationWalletId es requerido para transferencias internas' });
      return;
    }
    if (destinationWalletId === resolvedWalletId) {
      res.status(400).json({ error: 'El wallet origen y destino no pueden ser el mismo' });
      return;
    }
    const destCheck = await db.query('SELECT id FROM wallets WHERE id = $1', [destinationWalletId]);
    if (destCheck.rows.length === 0) {
      res.status(400).json({ error: 'destinationWalletId no existe' });
      return;
    }
  }

  // Precio histórico (FORK = 0 por ley AEAT)
  let finalPricePerUnit: number | null = isFork ? 0 : (pricePerUnit ? parseFloat(pricePerUnit) : null);
  if (!isFork && !finalPricePerUnit && finalAsset) {
    try { finalPricePerUnit = await getHistoricalPriceEur(finalAsset, new Date(timestamp)); } catch { /* dejar null */ }
  }

  // costAsset: solo EUR por defecto en operaciones fiat. Crypto ops tienen su propio asset.
  const resolvedCostAsset = costAsset ?? (
    ['BUY_FIAT', 'SELL_FIAT', 'DEPOSIT_FIAT', 'WITHDRAW_FIAT'].includes(operationType) ? 'EUR' : null
  );

  // costAmount: FORK = 0, resto normal
  let finalCostAmount: number | null = isFork ? 0 : (costAmount ? parseFloat(costAmount) : null);
  if (!isFork && !finalCostAmount && finalPricePerUnit && finalAmount) {
    finalCostAmount = parseFloat(finalAmount) * finalPricePerUnit;
  }

  const dbOperationType = mapCatalogTypeToDb(operationType);
  const dbAsset  = (finalAsset ?? 'OTHER').toString().toUpperCase();
  const dbAmount = parseFloat(finalAmount ?? '0') || 0;

  await db.query(
    `INSERT INTO transactions (
       operation_type, timestamp, asset, amount, amount_net,
       cost_asset, cost_amount, price_per_unit,
       fee_asset, fee_amount,
       wallet_id, destination_wallet_id, account, notes, manually_added
     ) VALUES (
       $1::operation_type, $2, $3, $4, $5,
       $6, $7, $8,
       $9, $10,
       $11, $12, 'Manual', $13, true
     )`,
    [
      dbOperationType, new Date(timestamp),
      dbAsset, dbAmount,
      parseFloat(amountNet ?? finalAmount ?? '0') || 0,
      resolvedCostAsset,
      finalCostAmount,
      finalPricePerUnit,
      feeAsset  ?? null,
      feeAmount ? parseFloat(feeAmount) : null,
      resolvedWalletId,
      destinationWalletId ?? null,
      notes ?? null,
    ]
  );

  // Recalcular FIFO de forma síncrona → devolvemos resultado al cliente
  try {
    const fifoResult = await runFifoEngine();
    res.json({ success: true, fifo: fifoResult });
  } catch (err) {
    res.json({ success: true, fifo: null, fifoError: (err as Error).message });
  }
});

// ── PUT /api/transactions/:id (editar transacción manual) ─────────────────
router.put('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const {
    operationType, asset, amount, amountNet,
    costAsset, costAmount, pricePerUnit,
    feeAsset, feeAmount,
    wallet_id, destinationWalletId, timestamp, notes,
  } = req.body;

  const tx = await db.query('SELECT id FROM transactions WHERE id = $1', [id]);
  if (tx.rows.length === 0) {
    res.status(404).json({ error: 'Transacción no encontrada' });
    return;
  }

  const isFeeOp    = operationType === 'FEE_NETWORK' || operationType === 'FEE_EXCHANGE';
  const isFork     = operationType === 'FORK';
  const isFiatOnly = operationType === 'DEPOSIT_FIAT' || operationType === 'WITHDRAW_FIAT';
  const isIgnored  = operationType === 'IGNORED';

  const finalAsset  = isFeeOp ? (feeAsset  ?? asset)  : asset;
  const finalAmount = isFeeOp ? (feeAmount ?? amount) : amount;

  if (!timestamp || !wallet_id) {
    res.status(400).json({ error: 'Faltan campos requeridos' });
    return;
  }
  if (!isFiatOnly && !isIgnored && !isFeeOp && (!finalAsset || !finalAmount)) {
    res.status(400).json({ error: 'asset y amount son requeridos para este tipo de operación' });
    return;
  }
  if (isFeeOp && !finalAsset) {
    res.status(400).json({ error: 'fee_asset es requerido para operaciones de fee' });
    return;
  }

  let finalPricePerUnit: number | null = isFork ? 0 : (pricePerUnit ? parseFloat(pricePerUnit) : null);
  if (!isFork && !finalPricePerUnit && finalAsset) {
    try { finalPricePerUnit = await getHistoricalPriceEur(finalAsset, new Date(timestamp)); } catch { /* ignorar */ }
  }

  const resolvedCostAsset = costAsset ?? (
    ['BUY_FIAT', 'SELL_FIAT', 'DEPOSIT_FIAT', 'WITHDRAW_FIAT'].includes(operationType) ? 'EUR' : null
  );
  let finalCostAmount: number | null = isFork ? 0 : (costAmount ? parseFloat(costAmount) : null);
  if (!isFork && !finalCostAmount && finalPricePerUnit) {
    finalCostAmount = parseFloat(finalAmount) * finalPricePerUnit;
  }

  const dbOpType = mapCatalogTypeToDb(operationType);
  // Si el tipo editado ya no es WITHDRAW, limpiar destination_pending
  const shouldClearPending = dbOpType !== 'WITHDRAW';

  await db.query(
    `UPDATE transactions SET
       operation_type        = $1::operation_type,
       timestamp             = $2,
       asset                 = $3,
       amount                = $4,
       amount_net            = $5,
       cost_asset            = $6,
       cost_amount           = $7,
       price_per_unit        = $8,
       fee_asset             = $9,
       fee_amount            = $10,
       wallet_id             = $11,
       destination_wallet_id = $12,
       destination_pending   = CASE WHEN $15 THEN FALSE ELSE destination_pending END,
       notes                 = $13,
       updated_at            = NOW()
     WHERE id = $14`,
    [
      dbOpType, new Date(timestamp),
      finalAsset ? finalAsset.toUpperCase() : null,
      finalAmount ? parseFloat(finalAmount) : null,
      finalAmount ? parseFloat(amountNet ?? finalAmount) : null,
      resolvedCostAsset, finalCostAmount, finalPricePerUnit,
      feeAsset  ?? null,
      feeAmount ? parseFloat(feeAmount) : null,
      wallet_id,
      destinationWalletId ?? null,
      notes ?? null,
      id,
      shouldClearPending,
    ]
  );

  try {
    const fifoResult = await runFifoEngine();
    res.json({ success: true, fifo: fifoResult });
  } catch (err) {
    res.json({ success: true, fifo: null, fifoError: (err as Error).message });
  }
});

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

// ── DELETE /api/transactions/:id ──────────────────────────────────────────
router.delete('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;

  const tx = await db.query('SELECT manually_added FROM transactions WHERE id = $1', [id]);
  if (tx.rows.length === 0) {
    res.status(404).json({ error: 'Transacción no encontrada' });
    return;
  }
  if (!tx.rows[0].manually_added) {
    res.status(403).json({ error: 'Solo se pueden borrar transacciones manuales desde aquí.' });
    return;
  }

  await db.transaction(async (client) => {
    await client.query(
      `DELETE FROM fifo_lot_consumptions
       WHERE consuming_transaction_id = $1
          OR lot_id IN (SELECT id FROM fifo_lots WHERE open_transaction_id = $1)`,
      [id]
    );
    await client.query('DELETE FROM fifo_lots WHERE open_transaction_id = $1', [id]);
    await client.query('DELETE FROM transactions WHERE id = $1', [id]);
  });

  try {
    const fifoResult = await runFifoEngine();
    res.json({ success: true, fifo: fifoResult });
  } catch (err) {
    res.json({ success: true, fifo: null, fifoError: (err as Error).message });
  }
});

function mapCatalogTypeToDb(catalogType: string): string {
  const map: Record<string, string> = {
    'BUY_FIAT':          'BUY_FIAT',
    'BUY_CRYPTO':        'BUY_CRYPTO',
    'SELL_FIAT':         'SELL_FIAT',
    'SELL_CRYPTO':       'SELL_CRYPTO',
    'STAKING_REWARD':    'STAKING_REWARD',
    'MINING_REWARD':     'MINING_REWARD',
    'LENDING_INTEREST':        'LENDING_INTEREST',
    'LENDING_INTEREST_LOCKED': 'LENDING_INTEREST_LOCKED',
    'CASHBACK':          'CASHBACK',
    'AIRDROP':           'AIRDROP',
    'DEPOSIT_CRYPTO':    'DEPOSIT_CRYPTO',
    'DEPOSIT_FIAT':      'DEPOSIT_FIAT',
    'WITHDRAW_FIAT':     'WITHDRAW_FIAT',
    'FORK':              'FORK',
    'GIFT_SENT':         'GIFT_SENT',
    'LOST':              'LOST',
    'TRANSFER_INTERNAL': 'TRANSFER_INTERNAL',
    'FEE_NETWORK':       'FEE_NETWORK',
    'FEE_EXCHANGE':      'FEE_EXCHANGE',
    'IGNORED':           'IGNORED',
    'BUY':               'BUY',
    'SELL':              'SELL',
    'WITHDRAW':          'WITHDRAW',
  };
  return map[catalogType] ?? catalogType;
}

export default router;
