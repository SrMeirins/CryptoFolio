import { Router, Request, Response } from 'express';
import { db } from '../../db/client';
import {
  transactionFieldsSchema, transactionUpdateSchema, sendZodError,
  isFeeOperation, resolveFinalAssetAmount, resolveFinalPricePerUnit,
  resolveCostAsset, resolveFinalCostAmount, respondWithFifoRecalc,
} from './transactionsShared';

const router = Router();

// ── POST /api/transactions/manual ─────────────────────────────────────────
router.post('/manual', async (req: Request, res: Response) => {
  const validation = transactionFieldsSchema.safeParse(req.body);
  if (!validation.success) {
    sendZodError(res, validation.error);
    return;
  }
  const {
    operationType, asset, amount, amountNet,
    costAsset, costAmount, pricePerUnit,
    feeAsset, feeAmount,
    wallet_id, destinationWalletId, timestamp, notes,
  } = validation.data;

  const isFeeOp   = isFeeOperation(operationType);
  const isIgnored = operationType === 'IGNORED';

  const { finalAsset, finalAmount } = resolveFinalAssetAmount(operationType, asset, amount, feeAsset, feeAmount);

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

  const finalPricePerUnit = await resolveFinalPricePerUnit(operationType, pricePerUnit, finalAsset, timestamp);
  const resolvedCostAsset = resolveCostAsset(operationType, costAsset);
  const finalCostAmount   = resolveFinalCostAmount(operationType, costAmount, finalPricePerUnit, finalAmount);

  const dbAsset  = (finalAsset ?? 'OTHER').toString().toUpperCase();
  const dbAmount = finalAmount ?? 0;

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
      operationType, new Date(timestamp),
      dbAsset, dbAmount,
      amountNet ?? finalAmount ?? 0,
      resolvedCostAsset,
      finalCostAmount,
      finalPricePerUnit,
      feeAsset  ?? null,
      feeAmount ?? null,
      resolvedWalletId,
      destinationWalletId ?? null,
      notes ?? null,
    ]
  );

  // Recalcular FIFO de forma síncrona → devolvemos resultado al cliente
  await respondWithFifoRecalc(res, 'POST /api/transactions/manual');
});

// ── PUT /api/transactions/:id (editar transacción manual) ─────────────────
router.put('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;

  const validation = transactionUpdateSchema.safeParse(req.body);
  if (!validation.success) {
    sendZodError(res, validation.error);
    return;
  }
  const {
    operationType, asset, amount, amountNet,
    costAsset, costAmount, pricePerUnit,
    feeAsset, feeAmount,
    wallet_id, destinationWalletId, timestamp, notes,
  } = validation.data;

  const tx = await db.query('SELECT id FROM transactions WHERE id = $1', [id]);
  if (tx.rows.length === 0) {
    res.status(404).json({ error: 'Transacción no encontrada' });
    return;
  }

  const isFeeOp    = isFeeOperation(operationType);
  const isIgnored  = operationType === 'IGNORED';
  const isFiatOnly = operationType === 'DEPOSIT_FIAT' || operationType === 'WITHDRAW_FIAT';

  const { finalAsset, finalAmount } = resolveFinalAssetAmount(operationType, asset, amount, feeAsset, feeAmount);

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

  const finalPricePerUnit = await resolveFinalPricePerUnit(operationType, pricePerUnit, finalAsset, timestamp);
  const resolvedCostAsset = resolveCostAsset(operationType, costAsset);
  const finalCostAmount   = resolveFinalCostAmount(operationType, costAmount, finalPricePerUnit, finalAmount);

  // Si el tipo editado ya no es WITHDRAW, limpiar destination_pending
  const shouldClearPending = operationType !== 'WITHDRAW';

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
      operationType, new Date(timestamp),
      finalAsset ? finalAsset.toUpperCase() : null,
      finalAmount ?? null,
      finalAmount ? (amountNet ?? finalAmount) : null,
      resolvedCostAsset, finalCostAmount, finalPricePerUnit,
      feeAsset  ?? null,
      feeAmount ?? null,
      wallet_id,
      destinationWalletId ?? null,
      notes ?? null,
      id,
      shouldClearPending,
    ]
  );

  await respondWithFifoRecalc(res, 'PUT /api/transactions/:id');
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

  await respondWithFifoRecalc(res, 'DELETE /api/transactions/:id');
});

export default router;
