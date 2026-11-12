import { PoolClient } from 'pg';
import { FifoLot, FifoRunResult, FIFO_DUST_EPSILON, FIFO_SHORTFALL_EPSILON } from './constants';
import { getHistoricalPriceEur } from '../prices/binance';

// Fechas cuyo tipo no se pudo obtener, para no repetir la petición en cada lote.
const FAILED_RATE_TTL_MS = 10 * 60_000;
const failedRateDays = new Map<string, number>(); // YYYY-MM-DD → expira (epoch ms)

/**
 * Tipo USD por EUR de una fecha, con USDT como referencia del dólar (#174):
 * 1 / (precio de 1 USDT en EUR). Es el mismo precio diario con el que el motor
 * valora en EUR una compra pagada en USDT, así que su coste en USD sale exacto.
 *
 * Nunca lanza: el coste en USD es un dato secundario y un fallo al obtenerlo
 * (sin conexión, Binance caído o bloqueado) no debe impedir el recálculo FIFO.
 * En ese caso devuelve null y el lote queda sin coste en USD.
 */
export async function usdPerEurAt(timestamp: Date): Promise<number | null> {
  const day = timestamp.toISOString().slice(0, 10);
  const failedUntil = failedRateDays.get(day);
  if (failedUntil !== undefined && failedUntil > Date.now()) return null;
  try {
    const usdtEur = await getHistoricalPriceEur('USDT', timestamp);
    if (usdtEur > 0) return 1 / usdtEur;
  } catch (e) {
    console.warn(`[FIFO] Sin tipo EUR/USD para ${day}; el lote queda sin coste en USD:`, (e as Error).message);
  }
  failedRateDays.set(day, Date.now() + FAILED_RATE_TTL_MS);
  return null;
}

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
  const usdPerEur = await usdPerEurAt(timestamp);
  await client.query(
    `INSERT INTO fifo_lots (
      asset, quantity_original, quantity_remaining,
      cost_basis_eur, price_per_unit_eur, fee_eur,
      open_transaction_id, opened_at, wallet_id, usd_per_eur
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [asset, quantity, quantity, costBasisEur, pricePerUnitEur, feeEur, txId, timestamp, walletId, usdPerEur]
  );
}

/**
 * Disposición con efecto fiscal (#476): FIFO global por activo. Se consumen los
 * lotes abiertos más antiguos del activo en todas las wallets, por su fecha de
 * adquisición original (un traslado la conserva), como indica la AEAT para
 * monedas virtuales homogéneas aunque estén en plataformas distintas.
 *
 * Para que cada wallet conserve sus unidades reales, si se consume un lote de
 * otra wallet V se reubica la misma cantidad de los lotes de `walletId` (donde
 * se dispone) a V: un consumo sin efecto fiscal y un lote nuevo en V con la
 * fecha y el coste de origen, igual que un traslado. Solo cambian el coste y la
 * ganancia de la operación; nunca las cantidades por wallet.
 *
 * Solo se dispone de lo que la wallet tiene: si los datos dicen que vende más,
 * el exceso es un hueco de datos de esa wallet (déficit, como antes) y no se
 * cubre con unidades de otras wallets, que las siguen teniendo.
 */
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
  const inWallet = (await getOpenLots(asset, walletId, client)).reduce((sum, l) => sum + l.quantityRemaining, 0);

  if (inWallet <= 0) {
    result.errors.push(`Sin lotes abiertos para ${asset} en wallet ${walletId} (tx ${txId})`);
    if (quantityToConsume > FIFO_SHORTFALL_EPSILON) {
      result.shortfalls.push({ txId, asset, walletId, requested: quantityToConsume, missing: quantityToConsume });
    }
    return;
  }

  const lots = await getOpenLots(asset, null, client);
  let remaining = Math.min(quantityToConsume, inWallet);
  const proceedsPerUnit = totalProceedsEur / quantityToConsume;
  // Cantidad consumida de otras wallets, que se reubica desde `walletId`.
  const relocations = new Map<string, number>();

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

    if (lot.walletId !== walletId) relocations.set(lot.walletId, (relocations.get(lot.walletId) ?? 0) + consumed);

    result.lotsConsumed++;
    remaining -= consumed;
  }

  // Igual que el shortfall de WITHDRAW en processTransfer: lo que la wallet no
  // tiene es una señal real de datos incompletos (venta/permuta/fee mayor que
  // lo que la app cree que posees en ella) — se reporta en vez de desaparecer
  // en silencio.
  const missing = quantityToConsume - Math.min(quantityToConsume, inWallet) + Math.max(0, remaining);
  if (missing > FIFO_SHORTFALL_EPSILON) {
    result.errors.push(
      `Lotes insuficientes para ${asset} en wallet ${walletId} (tx ${txId}): ` +
      `faltan ${missing.toFixed(6)} de ${quantityToConsume.toFixed(6)} solicitados`
    );
    result.shortfalls.push({ txId, asset, walletId, requested: quantityToConsume, missing });
  }

  // Reubicación: la wallet tiene al menos lo consumido, así que siempre puede
  // devolver a las otras lo que se tomó de ellas.
  let unmoved = 0;
  for (const [toWalletId, quantity] of relocations) {
    unmoved += await moveLots(client, { txId, asset, fromWalletId: walletId, toWalletId, quantity, timestamp });
  }
  if (unmoved > FIFO_SHORTFALL_EPSILON) {
    result.errors.push(`Reubicación incompleta de ${asset} desde wallet ${walletId} (tx ${txId}): faltan ${unmoved.toFixed(6)}`);
  }
}

/**
 * Traslada `quantity` de los lotes más antiguos de una wallet a otra sin efecto
 * fiscal: consumo NONE en el origen y lote nuevo en el destino que hereda la
 * fecha de adquisición, el precio y el tipo USD del lote de origen (#174).
 * `extraCostEur` (#532, comisión de red sumada al coste) se reparte entre los
 * lotes que llegan en proporción a su cantidad y se anota como gasto de
 * adquisición (`fee_eur`). El lote que llega hereda además su parte de la
 * comisión de compra del de origen (#603); el de origen no cambia, porque los
 * gastos se reparten sobre su cantidad original. Devuelve la cantidad que no se
 * pudo trasladar.
 */
export async function moveLots(
  client: PoolClient,
  move: { txId: string; asset: string; fromWalletId: string; toWalletId: string; quantity: number; timestamp: Date; extraCostEur?: number },
): Promise<number> {
  let quantityToMove = move.quantity;
  const lots = await getOpenLots(move.asset, move.fromWalletId, client);
  // Lo que de verdad se mueve: el reparto del coste extra va sobre eso.
  const movable = Math.min(move.quantity, lots.reduce((s, l) => s + l.quantityRemaining, 0));
  const extra = move.extraCostEur ?? 0;

  for (const lot of lots) {
    if (quantityToMove <= 0) break;

    const consumed = Math.min(lot.quantityRemaining, quantityToMove);
    const proportion = consumed / lot.quantityRemaining;
    const costMoved = lot.costBasisEur * proportion;

    await updateLot(client, lot.id, lot.quantityRemaining - consumed, lot.costBasisEur - costMoved);

    // Registrar como consumo NONE para reconstrucción histórica correcta
    await client.query(
      `INSERT INTO fifo_lot_consumptions (
        lot_id, consuming_transaction_id,
        quantity_consumed, cost_basis_consumed_eur,
        proceeds_eur, gain_loss_eur, fiscal_event_type, consumed_at
      ) VALUES ($1, $2, $3, $4, $4, 0, 'NONE', $5)`,
      [lot.id, move.txId, consumed, costMoved, move.timestamp]
    );

    const extraShare = extra > 0 && movable > 0 ? extra * (consumed / movable) : 0;
    // Parte de la comisión de compra que viaja con lo trasladado (#603), ya incluida en costMoved.
    const feeHeredada = lot.quantityOriginal > 0 ? lot.feeEur * consumed / lot.quantityOriginal : 0;
    await client.query(
      `INSERT INTO fifo_lots (
        asset, quantity_original, quantity_remaining,
        cost_basis_eur, price_per_unit_eur, fee_eur,
        open_transaction_id, opened_at, wallet_id, usd_per_eur, origin_lot_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [move.asset, consumed, consumed, costMoved + extraShare,
        extraShare > 0 ? (costMoved + extraShare) / consumed : lot.pricePerUnitEur, feeHeredada + extraShare,
        // Lote de origen (#544): permite seguir las unidades a través de wallets.
        move.txId, lot.openedAt, move.toWalletId, lot.usdPerEur, lot.id]
    );

    quantityToMove -= consumed;
  }
  return Math.max(0, quantityToMove);
}

/**
 * Lotes abiertos de un activo por fecha de adquisición original y, a igualdad,
 * por orden de creación. Con `walletId` null, los de todas las wallets (FIFO
 * global, #476); con una wallet, solo los suyos (traslados y margen).
 */
/**
 * Retira `quantity` de los lotes más antiguos de una wallet sin efecto fiscal
 * (consumo NONE) y devuelve su coste: la comisión de red sumada al coste del
 * traslado (#532). `missing` es lo que la wallet no tenía.
 */
export async function consumeWithoutEffect(
  client: PoolClient, txId: string, asset: string, walletId: string, quantity: number, timestamp: Date,
): Promise<{ costEur: number; missing: number }> {
  let remaining = quantity;
  let costEur = 0;
  for (const lot of await getOpenLots(asset, walletId, client)) {
    if (remaining <= 0) break;
    const consumed = Math.min(lot.quantityRemaining, remaining);
    const cost = lot.costBasisEur * (consumed / lot.quantityRemaining);
    await client.query(
      `INSERT INTO fifo_lot_consumptions (
        lot_id, consuming_transaction_id,
        quantity_consumed, cost_basis_consumed_eur,
        proceeds_eur, gain_loss_eur, fiscal_event_type, consumed_at
      ) VALUES ($1, $2, $3, $4, $4, 0, 'NONE', $5)`,
      [lot.id, txId, consumed, cost, timestamp]
    );
    await updateLot(client, lot.id, lot.quantityRemaining - consumed, lot.costBasisEur - cost);
    costEur += cost;
    remaining -= consumed;
  }
  return { costEur, missing: Math.max(0, remaining) };
}

export async function getOpenLots(asset: string, walletId: string | null, client: PoolClient): Promise<FifoLot[]> {
  const res = await client.query(
    `SELECT id, asset, quantity_original, quantity_remaining,
            cost_basis_eur, price_per_unit_eur, fee_eur, opened_at, wallet_id, open_transaction_id, usd_per_eur
     FROM fifo_lots
     WHERE asset = $1
       AND ($2::uuid IS NULL OR wallet_id = $2::uuid)
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
    feeEur: parseFloat(r.fee_eur as string) || 0,
    openedAt: r.opened_at as Date,
    walletId: r.wallet_id as string,
    openTransactionId: r.open_transaction_id as string,
    usdPerEur: r.usd_per_eur === null ? null : parseFloat(r.usd_per_eur as string),
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
