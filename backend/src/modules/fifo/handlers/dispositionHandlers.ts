import { PoolClient } from 'pg';
import { getHistoricalPriceEur } from '../../prices/binance';
import { Transaction, FifoRunResult, FIAT_NO_LOT, FIFO_SHORTFALL_EPSILON } from '../constants';
import { openLot, consumeLots, getOpenLots, moveLots, updateLot } from '../lotPrimitives';

// ── SELL ──────────────────────────────────────────────────────────────────
export async function processSell(tx: Transaction, result: FifoRunResult, client: PoolClient): Promise<void> {
  // Venta de fiat (EUR→cripto): no hay lotes que consumir, solo abrir lote del activo recibido
  if (FIAT_NO_LOT.has(tx.asset)) {
    if (tx.cost_asset && !FIAT_NO_LOT.has(tx.cost_asset) && tx.cost_amount && tx.cost_amount > 0) {
      let costBasisEur = tx.amount;
      let netReceived = tx.cost_amount;

      if (tx.fee_asset && tx.fee_amount) {
        if (tx.fee_asset === tx.cost_asset) {
          // Fee en el activo recibido: llega menos cantidad neta de la que figura en cost_amount.
          netReceived = tx.cost_amount - tx.fee_amount;
        } else if (tx.fee_asset === tx.asset) {
          // Fee en el propio fiat: coste total mayor (mismo criterio que processBuy).
          costBasisEur += tx.fee_amount;
        } else {
          // Fee en un tercer activo: disposición patrimonial propia, se consume aparte.
          const feePrice = await getHistoricalPriceEur(tx.fee_asset, tx.timestamp);
          const feeProceedsEur = tx.fee_amount * feePrice;
          await consumeLots(tx.id, tx.fee_asset, tx.wallet_id, tx.fee_amount, feeProceedsEur, tx.timestamp, result, client);
        }
      }

      if (netReceived > 0) {
        const pricePerUnit = costBasisEur / netReceived;
        await openLot(tx.cost_asset, netReceived, costBasisEur, pricePerUnit, 0, tx.id, tx.timestamp, tx.wallet_id, client);
        result.lotsCreated++;
      }
    }
    return;
  }

  let proceedsEur: number;

  if (tx.cost_asset === 'EUR') {
    proceedsEur = tx.cost_amount ?? 0;
  } else if (tx.cost_asset != null) {
    const price = await getHistoricalPriceEur(tx.cost_asset, tx.timestamp);
    proceedsEur = (tx.cost_amount ?? 0) * price;
  } else {
    const price = await getHistoricalPriceEur(tx.asset, tx.timestamp);
    proceedsEur = tx.amount * price;
  }

  if (tx.fee_asset && tx.fee_amount) {
    if (tx.fee_asset === tx.asset || tx.fee_asset === tx.cost_asset) {
      // Fee en el activo vendido o en el recibido: reduce los proceeds de ESTA
      // venta (ya sea porque una parte de lo vendido nunca generó cash, o porque
      // llega menos del activo recibido — ese ajuste ya lo hace netReceived más abajo).
      const feePrice = await getHistoricalPriceEur(tx.fee_asset, tx.timestamp);
      proceedsEur -= tx.fee_amount * feePrice;
    } else {
      // Fee en un tercer activo (ej. BNB): no tiene relación con los proceeds de
      // esta venta. Es una disposición patrimonial propia — se consumen sus lotes
      // por separado, igual que ya hace processBuy con el fee de activo distinto.
      const feePrice = await getHistoricalPriceEur(tx.fee_asset, tx.timestamp);
      const feeProceedsEur = tx.fee_amount * feePrice;
      await consumeLots(tx.id, tx.fee_asset, tx.wallet_id, tx.fee_amount, feeProceedsEur, tx.timestamp, result, client);
    }
  }

  await consumeLots(tx.id, tx.asset, tx.wallet_id, tx.amount, proceedsEur, tx.timestamp, result, client);

  // Abrir lote para el activo recibido si no es fiat (SELL_CRYPTO y SELL cripto→cripto/stablecoin).
  // USDT es cripto en la legislación española, igual que cualquier otro token.
  // Si el cost_asset es EUR/USD/fiat → no se crea lote (el cash no tiene coste FIFO).
  const receivedIsFiat = FIAT_NO_LOT.has(tx.cost_asset ?? '');
  if (!receivedIsFiat && tx.cost_asset && tx.cost_amount && tx.cost_amount > 0) {
    // La cantidad neta del activo recibido descuenta la fee si está en el mismo activo.
    const netReceived = (tx.fee_asset === tx.cost_asset && tx.fee_amount)
      ? tx.cost_amount - tx.fee_amount
      : tx.cost_amount;
    if (netReceived > 0) {
      const pricePerUnit = proceedsEur / netReceived;
      await openLot(tx.cost_asset, netReceived, proceedsEur, pricePerUnit, 0, tx.id, tx.timestamp, tx.wallet_id, client);
      result.lotsCreated++;
    }
  }
}

// ── LOST ──────────────────────────────────────────────────────────────────
export async function processLost(tx: Transaction, result: FifoRunResult, client: PoolClient): Promise<void> {
  await consumeLots(tx.id, tx.asset, tx.wallet_id, tx.amount, 0, tx.timestamp, result, client);
}

// ── MARGIN_REPAY ──────────────────────────────────────────────────────────
// Devolver un préstamo no es disposición patrimonial (NONE): el principal se
// devuelve con unidades de la wallet del préstamo. Si el repayment supera el
// principal pendiente, el exceso son intereses pagados en cripto: una
// transmisión con pérdida deducible que sigue el FIFO global (#476).
//
// La deuda pendiente se rastrea en `marginDebt` (mapa en memoria mantenido
// por runFifoEngine) para que la distinción principal/interés sea exacta
// independientemente de qué lote FIFO se consuma en cada momento.
export async function processMarginRepay(tx: Transaction, result: FifoRunResult, marginDebt: Map<string, number>, client: PoolClient): Promise<void> {
  if (FIAT_NO_LOT.has(tx.asset)) return;
  const lots = await getOpenLots(tx.asset, tx.wallet_id, client);
  if (lots.length === 0) return; // Sin lotes en la wallet del préstamo — silencioso

  const key = `${tx.asset}|${tx.wallet_id}`;
  const debtBefore = marginDebt.get(key) ?? 0;
  const principal = Math.min(tx.amount, Math.max(0, debtBefore));
  const interest = tx.amount - principal;
  marginDebt.set(key, Math.max(0, debtBefore - tx.amount));

  // Principal: sin impacto fiscal, sale de los lotes de la wallet del préstamo.
  let remaining = principal;
  for (const lot of lots) {
    if (remaining <= 0) break;
    const consumed = Math.min(lot.quantityRemaining, remaining);
    const costConsumed = lot.costBasisEur * (consumed / lot.quantityRemaining);
    await client.query(
      `INSERT INTO fifo_lot_consumptions (
        lot_id, consuming_transaction_id,
        quantity_consumed, cost_basis_consumed_eur,
        proceeds_eur, gain_loss_eur, fiscal_event_type, consumed_at
      ) VALUES ($1, $2, $3, $4, $4, 0, 'NONE', $5)`,
      [lot.id, tx.id, consumed, costConsumed, tx.timestamp]
    );
    await updateLot(client, lot.id, lot.quantityRemaining - consumed, lot.costBasisEur - costConsumed);
    result.lotsConsumed++;
    remaining -= consumed;
  }

  // Intereses: transmisión sin contraprestación, pérdida igual al coste consumido.
  // Cualquier cantidad, por pequeña que sea (como el motor anterior): el umbral
  // de déficit solo decide qué se avisa, no qué se consume.
  if (interest > 0) {
    await consumeLots(tx.id, tx.asset, tx.wallet_id, interest, 0, tx.timestamp, result, client);
  }
}

// ── TRANSFER / WITHDRAW ───────────────────────────────────────────────────
// Si destination_pending=true o no hay destination_wallet_id, los lotes se
// quedan en el wallet origen hasta que el usuario asigne el destino.
export async function processTransfer(tx: Transaction, result: FifoRunResult, client: PoolClient): Promise<void> {
  // Transferencia interna de fiat entre sub-cuentas: sin lotes que mover, sin ruido
  if (FIAT_NO_LOT.has(tx.asset)) return;

  if (tx.destination_pending || !tx.destination_wallet_id) {
    result.pendingWithdrawals++;
    return;
  }

  // Fee de retiro cobrada en el mismo activo (ej. fee de red al retirar a wallet externa):
  // es una disposición patrimonial real — parte del activo nunca llega a la wallet destino,
  // se "vende" a precio de mercado para pagar la red. Se consume ANTES de mover el resto,
  // igual que el fee-en-activo-distinto de processBuy. tx.amount ya viene neto de fee
  // (ver parser Bitvavo/Binance), así que aquí solo consumimos y contabilizamos el G/P.
  if (tx.operation_type === 'WITHDRAW' && tx.fee_asset === tx.asset && tx.fee_amount) {
    const feePrice = await getHistoricalPriceEur(tx.asset, tx.timestamp);
    const feeProceedsEur = tx.fee_amount * feePrice;
    await consumeLots(tx.id, tx.asset, tx.wallet_id, tx.fee_amount, feeProceedsEur, tx.timestamp, result, client);
  }

  // Traslado sin efecto fiscal: el lote conserva su fecha de adquisición (#174, #476).
  const quantityToMove = await moveLots(client, {
    txId: tx.id, asset: tx.asset, fromWalletId: tx.wallet_id, toWalletId: tx.destination_wallet_id,
    quantity: tx.amount, timestamp: tx.timestamp,
  });

  // WITHDRAW externo: cualquier shortfall es un error real (el dinero salió y los lotes deben existir).
  // TRANSFER_INTERNAL: sin impacto fiscal — el shortfall puede deberse a saldo pre-importación
  // o a artefactos de ordering; no afecta al cálculo de G/P.
  if (quantityToMove > FIFO_SHORTFALL_EPSILON && tx.operation_type === 'WITHDRAW') {
    result.errors.push(`TRANSFER sin lotes suficientes para ${tx.asset} tx=${tx.id} (faltan ${quantityToMove.toFixed(6)})`);
  }
  // Para el saldo corrido (#380) cuenta también en una transferencia interna:
  // sin efecto fiscal, pero la wallet de origen no tenía esa cantidad.
  if (quantityToMove > FIFO_SHORTFALL_EPSILON) {
    result.shortfalls.push({ txId: tx.id, asset: tx.asset, walletId: tx.wallet_id, requested: tx.amount, missing: quantityToMove });
  }
}

// ── FEE ───────────────────────────────────────────────────────────────────
export async function processFee(tx: Transaction, result: FifoRunResult, client: PoolClient): Promise<void> {
  const feeAsset = tx.fee_asset ?? tx.asset;
  const feeAmount = tx.fee_amount ?? tx.amount;

  if (!feeAsset || feeAmount <= 0) return;

  const priceEur = await getHistoricalPriceEur(feeAsset, tx.timestamp);
  const proceedsEur = feeAmount * priceEur;

  await consumeLots(tx.id, feeAsset, tx.wallet_id, feeAmount, proceedsEur, tx.timestamp, result, client);
}
