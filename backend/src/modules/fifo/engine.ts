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
     ORDER BY timestamp ASC, created_at ASC`
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
  console.log(`[FIFO] Ganancias: ${result.totalGainEur.toFixed(2)} EUR | Perdidas: ${result.totalLossEur.toFixed(2)} EUR`);

  return result;
}

async function processTransaction(tx: Transaction, result: FifoRunResult): Promise<void> {
  switch (tx.operation_type) {
    case 'BUY':
    case 'BUY_FIAT':
    case 'BUY_CRYPTO':
      await processBuy(tx, result);
      break;
    case 'STAKING_REWARD':
    case 'MINING_REWARD':
    case 'LENDING_INTEREST':
    case 'CASHBACK':
    case 'AIRDROP':
      await processIncome(tx, result);
      break;
    case 'FORK':
      await processFork(tx, result);
      break;
    case 'SELL':
    case 'SELL_FIAT':
    case 'SELL_CRYPTO':
    case 'GIFT_SENT':
      await processSell(tx, result);
      break;
    case 'LOST':
      await processLost(tx, result);
      break;
    case 'TRANSFER_INTERNAL':
    case 'WITHDRAW':
      await processTransfer(tx);
      break;
    case 'FEE':
    case 'FEE_NETWORK':
    case 'FEE_EXCHANGE':
      await processFee(tx, result);
      break;
    case 'DEPOSIT_FIAT':
    case 'INTERNAL_TRANSFER':
    case 'IGNORED':
    case 'CONVERT_IN':
    case 'CONVERT_OUT':
      break;
    default:
      console.warn(`[FIFO] Tipo no manejado: ${tx.operation_type}`);
  }
}

// ── BUY: abre lote FIFO ────────────────────────────────────────────────────
async function processBuy(tx: Transaction, result: FifoRunResult): Promise<void> {
  let costBasisEur = 0;
  let feeEur = 0;

  if (tx.cost_asset === 'EUR') {
    // Compra con EUR — coste directo
    costBasisEur = tx.cost_amount ?? 0;
  } else if (tx.cost_asset != null) {
    // Compra con otra cripto — convertir a EUR
    const price = await getHistoricalPriceEur(tx.cost_asset, tx.timestamp);
    costBasisEur = (tx.cost_amount ?? 0) * price;
  } else {
    // BUY_FIAT manual sin cost_asset: usar price_per_unit × amount_net
    if (tx.price_per_unit != null && tx.price_per_unit > 0) {
      costBasisEur = tx.amount_net * tx.price_per_unit;
    } else if (tx.cost_amount != null && tx.cost_amount > 0) {
      // Fallback: cost_amount directo
      costBasisEur = tx.cost_amount;
    } else {
      // Ultimo recurso: precio historico de Binance
      const price = await getHistoricalPriceEur(tx.asset, tx.timestamp);
      costBasisEur = tx.amount_net * price;
    }
  }

  // Fees
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
  if (quantity <= 0 || tx.asset === 'EUR') return;

  const pricePerUnitEur = quantity > 0 ? costBasisEur / quantity : 0;

  await openLot(tx.asset, quantity, costBasisEur, pricePerUnitEur, feeEur, tx.id, tx.timestamp, tx.wallet);
  result.lotsCreated++;

  // Permuta: cerrar lotes del activo pagado si es cripto
  if (
    tx.cost_asset &&
    tx.cost_asset !== 'EUR' &&
    tx.cost_asset !== tx.asset &&
    tx.cost_amount != null &&
    tx.cost_amount > 0
  ) {
    await consumeLots(tx.id, tx.cost_asset, tx.wallet, tx.cost_amount, costBasisEur, tx.timestamp, result);
  }
}

// ── INCOME: abre lote al precio de mercado ────────────────────────────────
async function processIncome(tx: Transaction, result: FifoRunResult): Promise<void> {
  if (tx.asset === 'EUR') return;
  const quantity = tx.amount_net;
  if (quantity <= 0) return;

  let pricePerUnitEur: number;
  if (tx.price_per_unit != null && tx.price_per_unit > 0) {
    pricePerUnitEur = tx.price_per_unit;
  } else {
    pricePerUnitEur = await getHistoricalPriceEur(tx.asset, tx.timestamp);
  }

  const costBasisEur = quantity * pricePerUnitEur;
  await openLot(tx.asset, quantity, costBasisEur, pricePerUnitEur, 0, tx.id, tx.timestamp, tx.wallet);
  result.lotsCreated++;
}

// ── FORK: abre lote a coste 0 ─────────────────────────────────────────────
async function processFork(tx: Transaction, result: FifoRunResult): Promise<void> {
  if (tx.asset === 'EUR') return;
  const quantity = tx.amount_net;
  if (quantity <= 0) return;

  await openLot(tx.asset, quantity, 0, 0, 0, tx.id, tx.timestamp, tx.wallet);
  result.lotsCreated++;
}

// ── SELL: cierra lotes FIFO ───────────────────────────────────────────────
async function processSell(tx: Transaction, result: FifoRunResult): Promise<void> {
  let proceedsEur = 0;

  if (tx.cost_asset === 'EUR') {
    proceedsEur = tx.cost_amount ?? 0;
  } else if (tx.cost_asset != null) {
    const price = await getHistoricalPriceEur(tx.cost_asset, tx.timestamp);
    proceedsEur = (tx.cost_amount ?? 0) * price;
  } else {
    // Sin contrapartida: usar precio historico
    const price = await getHistoricalPriceEur(tx.asset, tx.timestamp);
    proceedsEur = tx.amount * price;
  }

  if (tx.fee_asset && tx.fee_amount) {
    const feePrice = await getHistoricalPriceEur(tx.fee_asset, tx.timestamp);
    proceedsEur -= tx.fee_amount * feePrice;
  }

  await consumeLots(tx.id, tx.asset, tx.wallet, tx.amount, proceedsEur, tx.timestamp, result);

  // SELL_CRYPTO: abre lote del activo recibido
  if (tx.operation_type === 'SELL_CRYPTO' && tx.cost_asset && tx.cost_amount) {
    const pricePerUnit = tx.cost_amount > 0 ? proceedsEur / tx.cost_amount : 0;
    await openLot(tx.cost_asset, tx.cost_amount, proceedsEur, pricePerUnit, 0, tx.id, tx.timestamp, tx.wallet);
    result.lotsCreated++;
  }
}

// ── LOST: cierra lote con proceeds = 0 ───────────────────────────────────
async function processLost(tx: Transaction, result: FifoRunResult): Promise<void> {
  await consumeLots(tx.id, tx.asset, tx.wallet, tx.amount, 0, tx.timestamp, result);
}

// ── TRANSFER / WITHDRAW: mueve lote entre wallets ─────────────────────────
async function processTransfer(tx: Transaction): Promise<void> {
  let toWallet: string;

  if (tx.operation_type === 'WITHDRAW') {
    toWallet = 'TANGEM';
  } else {
    toWallet = tx.cost_asset ?? 'TANGEM';
  }

  let quantityToMove = tx.amount;
  const lots = await getOpenLots(tx.asset, tx.wallet);

  await db.transaction(async (client) => {
    for (const lot of lots) {
      if (quantityToMove <= 0) break;

      const consumed = Math.min(lot.quantityRemaining, quantityToMove);
      const proportion = consumed / lot.quantityRemaining;
      const costMoved = lot.costBasisEur * proportion;

      await updateLot(client, lot.id, lot.quantityRemaining - consumed, lot.costBasisEur - costMoved);

      await client.query(
        `INSERT INTO fifo_lots (
          asset, quantity_original, quantity_remaining,
          cost_basis_eur, price_per_unit_eur, fee_eur,
          open_transaction_id, opened_at, wallet
        ) VALUES ($1, $2, $3, $4, $5, 0, $6, $7, $8::wallet_type)`,
        [
          tx.asset, consumed, consumed,
          costMoved, lot.pricePerUnitEur,
          tx.id, lot.openedAt, toWallet,
        ]
      );

      quantityToMove -= consumed;
    }

    if (quantityToMove > 0.0001) {
      console.warn(`[FIFO] TRANSFER sin lotes suficientes para ${tx.asset} (faltan ${quantityToMove.toFixed(6)})`);
    }
  });
}

// ── FEE standalone ────────────────────────────────────────────────────────
async function processFee(tx: Transaction, result: FifoRunResult): Promise<void> {
  const feeAsset = tx.fee_asset ?? tx.asset;
  const feeAmount = tx.fee_amount ?? tx.amount;

  if (!feeAsset || feeAmount <= 0) return;

  const priceEur = await getHistoricalPriceEur(feeAsset, tx.timestamp);
  const proceedsEur = feeAmount * priceEur;

  await consumeLots(tx.id, feeAsset, tx.wallet, feeAmount, proceedsEur, tx.timestamp, result);
}

// ── Helpers ───────────────────────────────────────────────────────────────
async function openLot(
  asset: string,
  quantity: number,
  costBasisEur: number,
  pricePerUnitEur: number,
  feeEur: number,
  txId: string,
  timestamp: Date,
  wallet: string
): Promise<void> {
  await db.query(
    `INSERT INTO fifo_lots (
      asset, quantity_original, quantity_remaining,
      cost_basis_eur, price_per_unit_eur, fee_eur,
      open_transaction_id, opened_at, wallet
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::wallet_type)`,
    [asset, quantity, quantity, costBasisEur, pricePerUnitEur, feeEur, txId, timestamp, wallet]
  );
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

      if (gainLoss >= 0) result.totalGainEur += gainLoss;
      else result.totalLossEur += gainLoss;

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

async function updateLot(client: PoolClient, lotId: string, newRemaining: number, newCostBasis: number): Promise<void> {
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