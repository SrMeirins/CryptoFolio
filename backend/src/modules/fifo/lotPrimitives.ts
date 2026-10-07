import { PoolClient } from 'pg';
import { FifoLot, FifoRunResult, FIFO_DUST_EPSILON, FIFO_SHORTFALL_EPSILON } from './constants';

export async function openLot(
  asset: string,
  quantity: number,
  costBasisEur: number,
  pricePerUnitEur: number,
  feeEur: number,
  txId: string,
  timestamp: Date,
  walletId: string,
  client: PoolClient
): Promise<void> {
  await client.query(
    `INSERT INTO fifo_lots (
      asset, quantity_original, quantity_remaining,
      cost_basis_eur, price_per_unit_eur, fee_eur,
      open_transaction_id, opened_at, wallet_id
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [asset, quantity, quantity, costBasisEur, pricePerUnitEur, feeEur, txId, timestamp, walletId]
  );
}

export async function consumeLots(
  txId: string,
  asset: string,
  walletId: string,
  quantityToConsume: number,
  totalProceedsEur: number,
  timestamp: Date,
  result: FifoRunResult,
  client: PoolClient
): Promise<void> {
  const lots = await getOpenLots(asset, walletId, client);

  if (lots.length === 0) {
    result.errors.push(`Sin lotes abiertos para ${asset} en wallet ${walletId} (tx ${txId})`);
    return;
  }

  let remaining = quantityToConsume;
  const proceedsPerUnit = totalProceedsEur / quantityToConsume;

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

  // Igual que el shortfall de WITHDRAW en processTransfer: si tras consumir todos
  // los lotes disponibles queda cantidad sin cubrir, es una señal real de datos
  // incompletos (venta/permuta/fee mayor que lo que la app cree que posees) —
  // se reporta en vez de desaparecer en silencio.
  if (remaining > FIFO_SHORTFALL_EPSILON) {
    result.errors.push(
      `Lotes insuficientes para ${asset} en wallet ${walletId} (tx ${txId}): ` +
      `faltan ${remaining.toFixed(6)} de ${quantityToConsume.toFixed(6)} solicitados`
    );
  }
}

export async function getOpenLots(asset: string, walletId: string, client: PoolClient): Promise<FifoLot[]> {
  const res = await client.query(
    `SELECT id, asset, quantity_original, quantity_remaining,
            cost_basis_eur, price_per_unit_eur, opened_at, wallet_id, open_transaction_id
     FROM fifo_lots
     WHERE asset = $1
       AND wallet_id = $2
       AND is_closed = FALSE
       AND quantity_remaining > ${FIFO_DUST_EPSILON}
     ORDER BY opened_at ASC, created_at ASC`,
    [asset, walletId]
  );
  return res.rows.map((r: Record<string, unknown>) => ({
    id: r.id as string,
    asset: r.asset as string,
    quantityOriginal: parseFloat(r.quantity_original as string),
    quantityRemaining: parseFloat(r.quantity_remaining as string),
    costBasisEur: parseFloat(r.cost_basis_eur as string),
    pricePerUnitEur: parseFloat(r.price_per_unit_eur as string),
    openedAt: r.opened_at as Date,
    walletId: r.wallet_id as string,
    openTransactionId: r.open_transaction_id as string,
  }));
}

export async function updateLot(client: PoolClient, lotId: string, newRemaining: number, newCostBasis: number): Promise<void> {
  const isClosed = newRemaining <= FIFO_DUST_EPSILON;
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
