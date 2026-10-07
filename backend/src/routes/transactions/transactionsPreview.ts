import { Router, Request, Response } from 'express';
import { db } from '../../db/client';
import { getHistoricalPriceEur } from '../../modules/prices/binance';
import { CONSUME_OPS, OPEN_LOT_OPS, ZERO_COST_OPS, isFeeOperation } from './transactionsShared';

const router = Router();

// ── POST /api/transactions/manual/preview ──────────────────────────────────
router.post('/manual/preview', async (req: Request, res: Response) => {
  const {
    operationType, asset, amount, costAsset, costAmount,
    timestamp, wallet_id, destinationWalletId, feeAsset, feeAmount,
  } = req.body;

  const isFeeOp = isFeeOperation(operationType);
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
  const affectedLots: unknown[] = [];
  let newLot: unknown = null;
  const transferLots: unknown[] = [];

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

export default router;
