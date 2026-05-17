import { Router, Request, Response } from 'express';
import { db } from '../db/client';
import { runFifoEngine } from '../modules/fifo/engine';
import { getHistoricalPriceEur } from '../modules/prices/binance';

const router = Router();

// POST /api/transactions/manual/preview
router.post('/manual/preview', async (req: Request, res: Response) => {
  const { operationType, asset, amount, costAsset, costAmount, timestamp, wallet, feeAsset, feeAmount } = req.body;

  if (!operationType || !asset || !timestamp) {
    res.status(400).json({ error: 'operationType, asset y timestamp son requeridos' });
    return;
  }

  const date = new Date(timestamp);
  const warnings: string[] = [];

  // 1. Detectar solapamiento con imports existentes
  const importRanges = await db.query(
    `SELECT ci.filename, MIN(t.timestamp) as date_from, MAX(t.timestamp) as date_to
     FROM csv_imports ci JOIN transactions t ON t.import_id = ci.id
     GROUP BY ci.id, ci.filename`
  );

  for (const range of importRanges.rows) {
    const from = new Date(range.date_from);
    const to = new Date(range.date_to);
    if (date >= from && date <= to) {
      warnings.push(`La fecha esta dentro del rango importado de "${range.filename}" (${from.toISOString().slice(0, 10)} - ${to.toISOString().slice(0, 10)})`);
    }
  }

  // 2. Detectar si afecta al FIFO historico
  const lastTx = await db.query(`SELECT MAX(timestamp) as last_ts FROM transactions`);
  if (lastTx.rows[0].last_ts && date < new Date(lastTx.rows[0].last_ts)) {
    warnings.push(`Esta fecha es anterior a la ultima transaccion registrada. El recalculo FIFO afectara a todas las operaciones posteriores.`);
  }

  // 3. Obtener precio historico automaticamente
  let priceEur: number | null = null;
  try {
    priceEur = await getHistoricalPriceEur(asset, date);
  } catch { /* ignorar */ }

  // 4. Calcular impacto fiscal estimado
  let estimatedGainLoss: number | null = null;
  let affectedLots: unknown[] = [];

  const isSale = ['SELL', 'SELL_FIAT', 'SELL_CRYPTO', 'GIFT_SENT', 'LOST'].includes(operationType);

  if (isSale && amount) {
    const lots = await db.query(
      `SELECT id, quantity_remaining, cost_basis_eur, price_per_unit_eur, opened_at
       FROM fifo_lots
       WHERE asset = $1 AND wallet = $2::wallet_type
         AND is_closed = FALSE AND quantity_remaining > 0
       ORDER BY opened_at ASC`,
      [asset, wallet ?? 'BINANCE']
    );

    let proceedsEur = 0;
    if (costAsset === 'EUR' && costAmount) {
      proceedsEur = parseFloat(costAmount);
    } else if (priceEur) {
      proceedsEur = parseFloat(amount) * priceEur;
    }

    let remaining = parseFloat(amount);
    let totalCost = 0;
    const proceedsPerUnit = proceedsEur / parseFloat(amount);

    for (const lot of lots.rows) {
      if (remaining <= 0) break;
      const consumed = Math.min(parseFloat(lot.quantity_remaining), remaining);
      const proportion = consumed / parseFloat(lot.quantity_remaining);
      const costConsumed = parseFloat(lot.cost_basis_eur) * proportion;
      totalCost += costConsumed;
      remaining -= consumed;
      affectedLots.push({
        lotId: lot.id,
        openedAt: lot.opened_at,
        consumed,
        costConsumed,
        pricePerUnit: lot.price_per_unit_eur,
      });
    }

    estimatedGainLoss = proceedsEur - totalCost;
  }

  res.json({ warnings, priceEur, estimatedGainLoss, affectedLots });
});

// POST /api/transactions/manual
router.post('/manual', async (req: Request, res: Response) => {
  const {
    operationType, asset, amount, amountNet,
    costAsset, costAmount, pricePerUnit,
    feeAsset, feeAmount,
    wallet, timestamp, notes,
  } = req.body;

  if (!operationType || !asset || !amount || !timestamp || !wallet) {
    res.status(400).json({ error: 'operationType, asset, amount, timestamp y wallet son requeridos' });
    return;
  }

  // Obtener precio historico si no se proporciono
  let finalPricePerUnit = pricePerUnit ? parseFloat(pricePerUnit) : null;
  if (!finalPricePerUnit) {
    try {
      finalPricePerUnit = await getHistoricalPriceEur(asset, new Date(timestamp));
    } catch { /* dejar null */ }
  }

  // Calcular cost_amount si no se proporciono
  let finalCostAmount = costAmount ? parseFloat(costAmount) : null;
  if (!finalCostAmount && finalPricePerUnit && amount) {
    finalCostAmount = parseFloat(amount) * finalPricePerUnit;
  }

  const dbOperationType = mapCatalogTypeToDb(operationType);

  await db.query(
    `INSERT INTO transactions (
      operation_type, timestamp, asset, amount, amount_net,
      cost_asset, cost_amount, price_per_unit,
      fee_asset, fee_amount,
      wallet, account, sub_trade_count, notes, manually_added
    ) VALUES (
      $1::operation_type, $2, $3, $4, $5,
      $6, $7, $8,
      $9, $10,
      $11::wallet_type, 'Manual', 1, $12, true
    )`,
    [
      dbOperationType,
      new Date(timestamp),
      asset.toUpperCase(),
      parseFloat(amount),
      parseFloat(amountNet ?? amount),
      costAsset ?? 'EUR',
      finalCostAmount,
      finalPricePerUnit,
      feeAsset ?? null,
      feeAmount ? parseFloat(feeAmount) : null,
      wallet,
      notes ?? null,
    ]
  );

  runFifoEngine().catch(err =>
    console.error('[MANUAL TX] Error recalculando FIFO:', err.message)
  );

  res.json({ success: true });
});

// GET /api/transactions
router.get('/', async (req: Request, res: Response) => {
  const { asset, type, wallet, manually_added, limit = '50', offset = '0' } = req.query;

  let where = 'WHERE 1=1';
  const params: unknown[] = [];
  let paramIdx = 1;

  if (asset) { where += ` AND asset = $${paramIdx++}`; params.push((asset as string).toUpperCase()); }
  if (type) { where += ` AND operation_type = $${paramIdx++}`; params.push(type); }
  if (wallet) { where += ` AND wallet = $${paramIdx++}::wallet_type`; params.push(wallet); }
  if (manually_added !== undefined) { where += ` AND manually_added = $${paramIdx++}`; params.push(manually_added === 'true'); }

  params.push(parseInt(limit as string));
  params.push(parseInt(offset as string));

  const result = await db.query(
    `SELECT id, operation_type, timestamp, asset, amount, amount_net,
            cost_asset, cost_amount, price_per_unit,
            fee_asset, fee_amount, wallet, notes, manually_added, created_at
     FROM transactions
     ${where}
     ORDER BY timestamp DESC
     LIMIT $${paramIdx++} OFFSET $${paramIdx}`,
    params
  );

  const total = await db.query(`SELECT COUNT(*) FROM transactions ${where}`, params.slice(0, -2));

  res.json({
    transactions: result.rows,
    total: parseInt(total.rows[0].count),
    limit: parseInt(limit as string),
    offset: parseInt(offset as string),
  });
});

// DELETE /api/transactions/:id
router.delete('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;

  const tx = await db.query('SELECT manually_added FROM transactions WHERE id = $1', [id]);

  if (tx.rows.length === 0) {
    res.status(404).json({ error: 'Transaccion no encontrada' });
    return;
  }

  if (!tx.rows[0].manually_added) {
    res.status(403).json({ error: 'Solo se pueden borrar transacciones manuales desde aqui.' });
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

  runFifoEngine().catch(err =>
    console.error('[DELETE MANUAL TX] Error recalculando FIFO:', err.message)
  );

  res.json({ success: true });
});

function mapCatalogTypeToDb(catalogType: string): string {
  const map: Record<string, string> = {
    'BUY_FIAT':         'BUY_FIAT',
    'BUY_CRYPTO':       'BUY_CRYPTO',
    'SELL_FIAT':        'SELL_FIAT',
    'SELL_CRYPTO':      'SELL_CRYPTO',
    'STAKING_REWARD':   'STAKING_REWARD',
    'MINING_REWARD':    'MINING_REWARD',
    'LENDING_INTEREST': 'LENDING_INTEREST',
    'CASHBACK':         'CASHBACK',
    'AIRDROP':          'AIRDROP',
    'FORK':             'FORK',
    'GIFT_SENT':        'GIFT_SENT',
    'LOST':             'LOST',
    'TRANSFER_INTERNAL':'TRANSFER_INTERNAL',
    'FEE_NETWORK':      'FEE_NETWORK',
    'FEE_EXCHANGE':     'FEE_EXCHANGE',
    'IGNORED':          'IGNORED',
    'BUY':              'BUY',
    'SELL':             'SELL',
    'WITHDRAW':         'WITHDRAW',
  };
  return map[catalogType] ?? catalogType;
}

export default router;