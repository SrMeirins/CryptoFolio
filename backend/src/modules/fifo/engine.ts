import { PoolClient } from 'pg';
import { db } from '../../db/client';
import { getHistoricalPriceEur } from '../prices/binance';

interface FifoLot {
  id: string;
  asset: string;
  quantityOriginal: number;
  quantityRemaining: number;
  costBasisEur: number;
  pricePerUnitEur: number;
  openedAt: Date;
  wallet: string;
}

interface Transaction {
  id: string;
  operation_type: string;
  timestamp: Date;
  asset: string;
  amount: number;
  amount_net: number;
  cost_asset: string | null;
  cost_amount: number | null;
  price_per_unit: number | null;
  fee_asset: string | null;
  fee_amount: number | null;
  wallet: string;
}

export interface FifoRunResult {
  lotsCreated: number;
  lotsConsumed: number;
  totalGainEur: number;
  totalLossEur: number;
  errors: string[];
}

export async function runFifoEngine(): Promise<FifoRunResult> {
  const result: FifoRunResult = {
    lotsCreated: 0,
    lotsConsumed: 0,
    totalGainEur: 0,
    totalLossEur: 0,
    errors: [],
  };

  await db.transaction(async (client) => {
    await client.query('DELETE FROM fifo_lot_consumptions');
    await client.query('DELETE FROM fifo_lots');
  });

  const txRes = await db.query(
    `SELECT id, operation_type, timestamp, asset, amount, amount_net,
            cost_asset, cost_amount, price_per_unit,
            fee_asset, fee_amount, wallet
     FROM transactions
     ORDER BY timestamp ASC`
  );

  const transactions: Transaction[] = txRes.rows.map((r: Record<string, unknown>) => ({
    id: r.id as string,
    operation_type: r.operation_type as string,
    timestamp: r.timestamp as Date,
    asset: r.asset as string,
    amount: parseFloat(r.amount as string),
    amount_net: parseFloat(r.amount_net as string),
    cost_asset: r.cost_asset as string | null,
    cost_amount: r.cost_amount != null ? parseFloat(r.cost_amount as string) : null,
    price_per_unit: r.price_per_unit != null ? parseFloat(r.price_per_unit as string) : null,
    fee_asset: r.fee_asset as string | null,
    fee_amount: r.fee_amount != null ? parseFloat(r.fee_amount as string) : null,
    wallet: r.wallet as string,
  }));

  console.log(`[FIFO] Procesando ${transactions.length} transacciones...`);

  for (const tx of transactions) {
    try {
      await processTransaction(tx, result);
    } catch (e) {
      const msg = `Error en tx ${tx.id} (${tx.operation_type} ${tx.asset} @ ${tx.timestamp.toISOString()}): ${(e as Error).message}`;
      console.error('[FIFO]', msg);
      result.errors.push(msg);
    }
  }

  console.log(`[FIFO] Completado: ${result.lotsCreated} lotes, ${result.lotsConsumed} consumos`);
  console.log(`[FIFO] Ganancias: ${result.totalGainEur.toFixed(2)} EUR | Pérdidas: ${result.totalLossEur.toFixed(2)} EUR`);

  return result;
}

async function processTransaction(
  tx: Transaction,
  result: FifoRunResult
): Promise<void> {
  switch (tx.operation_type) {
    case 'BUY':
      await processBuy(tx, result);
      break;
    case 'SELL':
      await processSell(tx, result);
      break;
    case 'WITHDRAW':
      await processWithdraw(tx);
      break;
    case 'DEPOSIT_FIAT':
    case 'INTERNAL_TRANSFER':
    case 'IGNORED':
      break;
    default:
      console.warn(`[FIFO] Tipo no manejado: ${tx.operation_type}`);
  }
}

async function processBuy(tx: Transaction, result: FifoRunResult): Promise<void> {
  let costBasisEur = 0;
  let feeEur = 0;

  if (tx.cost_asset === 'EUR') {
    costBasisEur = tx.cost_amount ?? 0;
  } else if (tx.cost_asset != null) {
    const price = await getHistoricalPriceEur(tx.cost_asset, tx.timestamp);
    costBasisEur = (tx.cost_amount ?? 0) * price;
  }

  if (tx.fee_asset && tx.fee_amount) {
    if (tx.fee_asset === tx.asset) {
      const unitPriceEur = tx.amount_net > 0 ? costBasisEur / tx.amount_net : 0;
      feeEur = tx.fee_amount * unitPriceEur;
    } else {
      const feePrice = await getHistoricalPriceEur(tx.fee_asset, tx.timestamp);
      feeEur = tx.fee_amount * feePrice;
    }
    costBasisEur += feeEur;
  }

  const quantity = tx.amount_net;
  if (quantity <= 0) return;
  if (tx.asset === 'EUR') return;

  const pricePerUnitEur = costBasisEur / quantity;

  await db.query(
    `INSERT INTO fifo_lots (
      asset, quantity_original, quantity_remaining,
      cost_basis_eur, price_per_unit_eur, fee_eur,
      open_transaction_id, opened_at, wallet
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::wallet_type)`,
    [
      tx.asset, quantity, quantity,
      costBasisEur, pricePerUnitEur, feeEur,
      tx.id, tx.timestamp, tx.wallet,
    ]
  );
  result.lotsCreated++;

  // Cerrar lotes FIFO del activo pagado si es cripto (permuta fiscal)
  if (
    tx.cost_asset &&
    tx.cost_asset !== 'EUR' &&
    tx.cost_asset !== tx.asset &&
    tx.cost_amount != null &&
    tx.cost_amount > 0
  ) {
    await consumeLots(
      tx.id,
      tx.cost_asset,
      tx.wallet,
      tx.cost_amount,
      costBasisEur,
      tx.timestamp,
      result
    );
  }
}

async function processSell(tx: Transaction, result: FifoRunResult): Promise<void> {
  let proceedsEur = 0;

  if (tx.cost_asset === 'EUR') {
    proceedsEur = tx.cost_amount ?? 0;
  } else if (tx.cost_asset != null) {
    const price = await getHistoricalPriceEur(tx.cost_asset, tx.timestamp);
    proceedsEur = (tx.cost_amount ?? 0) * price;
  } else {
    const price = await getHistoricalPriceEur(tx.asset, tx.timestamp);
    proceedsEur = tx.amount * price;
  }

  await consumeLots(
    tx.id, tx.asset, tx.wallet,
    tx.amount, proceedsEur, tx.timestamp, result
  );
}

async function processWithdraw(tx: Transaction): Promise<void> {
  let quantityToMove = tx.amount;
  const lots = await getOpenLots(tx.asset, 'BINANCE');

  await db.transaction(async (client) => {
    for (const lot of lots) {
      if (quantityToMove <= 0) break;

      const consumed = Math.min(lot.quantityRemaining, quantityToMove);
      // Proporción sobre el remaining actual, no el original
      const proportion = consumed / lot.quantityRemaining;
      const costMoved = lot.costBasisEur * proportion;

      await updateLot(client, lot.id, lot.quantityRemaining - consumed, lot.costBasisEur - costMoved);

      await client.query(
        `INSERT INTO fifo_lots (
          asset, quantity_original, quantity_remaining,
          cost_basis_eur, price_per_unit_eur, fee_eur,
          open_transaction_id, opened_at, wallet
        ) VALUES ($1, $2, $3, $4, $5, 0, $6, $7, 'TANGEM'::wallet_type)`,
        [
          tx.asset, consumed, consumed,
          costMoved, lot.pricePerUnitEur,
          tx.id, lot.openedAt,
        ]
      );

      quantityToMove -= consumed;
    }

    if (quantityToMove > 0.0001) {
      console.warn(
        `[FIFO] WITHDRAW sin lotes suficientes para ${tx.asset} ` +
        `(faltan ${quantityToMove.toFixed(6)})`
      );
    }
  });
}

async function consumeLots(
  txId: string,
  asset: string,
  wallet: string,
  quantityToConsume: number,
  totalProceedsEur: number,
  timestamp: Date,
  result: FifoRunResult
): Promise<void> {
  const lots = await getOpenLots(asset, wallet);

  if (lots.length === 0) {
    console.warn(`[FIFO] Sin lotes abiertos para ${asset} en ${wallet}`);
    return;
  }

  let remaining = quantityToConsume;
  const proceedsPerUnit = totalProceedsEur / quantityToConsume;

  await db.transaction(async (client) => {
    for (const lot of lots) {
      if (remaining <= 0) break;

      const consumed = Math.min(lot.quantityRemaining, remaining);
      // Proporción sobre el remaining actual del lote (no el original)
      const proportion = consumed / lot.quantityRemaining;
      const costConsumed = lot.costBasisEur * proportion;
      const proceedsConsumed = consumed * proceedsPerUnit;
      const gainLoss = proceedsConsumed - costConsumed;

      await client.query(
        `INSERT INTO fifo_lot_consumptions (
          lot_id, consuming_transaction_id,
          quantity_consumed, cost_basis_consumed_eur,
          proceeds_eur, gain_loss_eur, fiscal_event_type, consumed_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7::fiscal_event_type, $8)`,
        [
          lot.id, txId, consumed, costConsumed,
          proceedsConsumed, gainLoss,
          gainLoss >= 0 ? 'GAIN' : 'LOSS',
          timestamp,
        ]
      );

      await updateLot(client, lot.id, lot.quantityRemaining - consumed, lot.costBasisEur - costConsumed);

      if (gainLoss >= 0) {
        result.totalGainEur += gainLoss;
      } else {
        result.totalLossEur += gainLoss;
      }

      result.lotsConsumed++;
      remaining -= consumed;
    }
  });
}

async function getOpenLots(asset: string, wallet: string): Promise<FifoLot[]> {
  const res = await db.query(
    `SELECT id, asset, quantity_original, quantity_remaining,
            cost_basis_eur, price_per_unit_eur, opened_at, wallet
     FROM fifo_lots
     WHERE asset = $1
       AND wallet = $2::wallet_type
       AND is_closed = FALSE
       AND quantity_remaining > 0.000001
     ORDER BY opened_at ASC`,
    [asset, wallet]
  );
  return res.rows.map((r: Record<string, unknown>) => ({
    id: r.id as string,
    asset: r.asset as string,
    quantityOriginal: parseFloat(r.quantity_original as string),
    quantityRemaining: parseFloat(r.quantity_remaining as string),
    costBasisEur: parseFloat(r.cost_basis_eur as string),
    pricePerUnitEur: parseFloat(r.price_per_unit_eur as string),
    openedAt: r.opened_at as Date,
    wallet: r.wallet as string,
  }));
}

async function updateLot(
  client: PoolClient,
  lotId: string,
  newRemaining: number,
  newCostBasis: number
): Promise<void> {
  const isClosed = newRemaining <= 0.000001;
  await client.query(
    `UPDATE fifo_lots
     SET quantity_remaining = $1,
         cost_basis_eur = $2,
         is_closed = $3,
         closed_at = CASE WHEN $3 THEN NOW() ELSE NULL END
     WHERE id = $4`,
    [Math.max(0, newRemaining), Math.max(0, newCostBasis), isClosed, lotId]
  );
}
