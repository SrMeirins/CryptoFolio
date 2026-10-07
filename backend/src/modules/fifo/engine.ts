import { PoolClient } from 'pg';
import { db } from '../../db/client';
import { Transaction, FifoRunResult } from './constants';
import { getOpenLots } from './lotPrimitives';
import { reorderTransactions } from './ordering';
import { processBuy, processIncome, processFork } from './handlers/acquisitionHandlers';
import { processSell, processLost, processMarginRepay, processTransfer, processFee } from './handlers/dispositionHandlers';

export type { FifoRunResult } from './constants';
export { FIFO_DUST_EPSILON } from './constants';
export { getOpenLots } from './lotPrimitives';

// Clave fija del advisory lock que serializa ejecuciones de runFifoEngine().
// pg_advisory_xact_lock la libera automáticamente al COMMIT/ROLLBACK de la
// transacción — no requiere unlock manual ni riesgo de dejarlo colgado.
const FIFO_ENGINE_LOCK_KEY = `'cryptotracker:fifo_engine'`;

export async function runFifoEngine(): Promise<FifoRunResult> {
  const result: FifoRunResult = {
    lotsCreated: 0,
    lotsConsumed: 0,
    totalGainEur: 0,
    totalLossEur: 0,
    errors: [],
    warnings: [],
    pendingWithdrawals: 0,
  };

  return db.transaction(async (client) => {
    // Serializa ejecuciones concurrentes: una segunda llamada a runFifoEngine()
    // espera aquí hasta que la primera haga COMMIT/ROLLBACK, en vez de
    // entrelazar sus DELETE/INSERT sobre las mismas filas.
    await client.query(`SELECT pg_advisory_xact_lock(hashtext(${FIFO_ENGINE_LOCK_KEY}))`);

    await client.query('DELETE FROM fifo_lot_consumptions');
    await client.query('DELETE FROM fifo_lots');

    const txRes = await client.query(
      `SELECT id, operation_type, timestamp, asset, amount, amount_net,
            cost_asset, cost_amount, price_per_unit,
            fee_asset, fee_amount,
            wallet_id, destination_wallet_id, destination_pending
     FROM transactions
     ORDER BY timestamp ASC, created_at ASC,
       -- Dentro del mismo segundo, abrir lotes antes de consumirlos.
       -- BUY/INCOME primero → luego SELL/FEE_EXCHANGE que necesitan esos lotes.
       CASE operation_type
         -- Prioridad 0: préstamos → lote abierto antes que cualquier venta del activo prestado
         WHEN 'MARGIN_BORROW'   THEN 0
         -- Prioridad 1: ingresos puros (solo crean lotes, no consumen)
         WHEN 'AIRDROP'         THEN 1
         WHEN 'DEPOSIT_CRYPTO'  THEN 1
         WHEN 'STAKING_REWARD'  THEN 1
         WHEN 'MINING_REWARD'   THEN 1
         WHEN 'LENDING_INTEREST'        THEN 1
         WHEN 'LENDING_INTEREST_LOCKED' THEN 1
         WHEN 'CASHBACK'        THEN 1
         WHEN 'FORK'            THEN 1
         -- Prioridad 2: transferencias internas → mueven/crean lotes entre wallets ANTES de
         -- que SELL o BUY intenten consumirlos (p.ej. Spot→Strategy al mismo timestamp que
         -- una venta o compra en Strategy — antes solo se protegía el caso BUY, no SELL)
         WHEN 'TRANSFER_INTERNAL' THEN 2
         -- Prioridad 3: ventas → consumen lotes del activo vendido Y crean lotes del recibido (p.ej. USDT)
         WHEN 'SELL'            THEN 3
         WHEN 'SELL_FIAT'       THEN 3
         WHEN 'SELL_CRYPTO'     THEN 3
         WHEN 'GIFT_SENT'       THEN 3
         WHEN 'LOST'            THEN 3
         -- Prioridad 4: compras → crean lote del activo recibido y consumen el cost_asset (p.ej. USDT)
         WHEN 'BUY'             THEN 4
         WHEN 'BUY_FIAT'        THEN 4
         WHEN 'BUY_CRYPTO'      THEN 4
         -- Prioridad 5: retiros externos
         WHEN 'WITHDRAW'        THEN 5
         -- Prioridad 6: fees → siempre al final (consumen lotes del activo de fee)
         WHEN 'FEE_EXCHANGE'    THEN 6
         WHEN 'FEE'             THEN 6
         WHEN 'FEE_NETWORK'     THEN 6
         -- Prioridad 7: devolución de préstamo → cierra los lotes de MARGIN_BORROW
         WHEN 'MARGIN_REPAY'    THEN 7
         ELSE 7
       END`
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
      wallet_id: r.wallet_id as string,
      destination_wallet_id: r.destination_wallet_id as string | null,
      destination_pending: r.destination_pending as boolean,
    }));

    // Corrige el quirk de timestamp de MARGIN_BORROW de Binance y reordena
    // (ver ordering.ts) con los timestamps ya corregidos.
    reorderTransactions(transactions);

    // Deuda de margen pendiente por activo+wallet: se actualiza a medida que el engine
    // procesa MARGIN_BORROW y MARGIN_REPAY. Permite distinguir principal (NONE) de
    // interés (LOSS) sin depender de qué lote FIFO se consume en cada momento.
    const marginDebt = new Map<string, number>(); // key: `${asset}|${walletId}`

    // Helper para registrar y procesar un MARGIN_BORROW (usado en lookahead y en el bucle normal)
    const processBorrow = async (tx: Transaction) => {
      const key = `${tx.asset}|${tx.wallet_id}`;
      marginDebt.set(key, (marginDebt.get(key) ?? 0) + tx.amount);
      await processTransaction(tx, result, marginDebt, client);
    };

    const processedIds = new Set<string>();

    for (let i = 0; i < transactions.length; i++) {
      const tx = transactions[i];
      if (processedIds.has(tx.id)) continue;

      try {
        // Lookahead: si este BUY va a gastar más cost_asset del que hay disponible en la wallet,
        // buscamos hacia adelante (ventana 60s) algún MARGIN_BORROW del mismo activo+wallet
        // y lo procesamos primero. Solo se activa ante déficit real → no rompe otros flujos.
        if (
          (tx.operation_type === 'BUY' || tx.operation_type === 'BUY_FIAT' || tx.operation_type === 'BUY_CRYPTO') &&
          tx.cost_asset && tx.cost_asset !== 'EUR' && tx.cost_amount
        ) {
          const openLots = await getOpenLots(tx.cost_asset, tx.wallet_id, client);
          const available = openLots.reduce((sum, l) => sum + l.quantityRemaining, 0);
          if (available < tx.cost_amount) {
            const deadline = tx.timestamp.getTime() + 60_000;
            for (let j = i + 1; j < transactions.length; j++) {
              const fut = transactions[j];
              if (fut.timestamp.getTime() > deadline) break;
              if (
                fut.operation_type === 'MARGIN_BORROW' &&
                fut.asset === tx.cost_asset &&
                fut.wallet_id === tx.wallet_id &&
                !processedIds.has(fut.id)
              ) {
                await processBorrow(fut);
                processedIds.add(fut.id);
              }
            }
          }
        }

        if (tx.operation_type === 'MARGIN_BORROW') {
          await processBorrow(tx);
        } else {
          await processTransaction(tx, result, marginDebt, client);
        }
        processedIds.add(tx.id);
      } catch (e) {
        const msg = `Error en tx ${tx.id} (${tx.operation_type} ${tx.asset} @ ${tx.timestamp.toISOString()}): ${(e as Error).message}`;
        result.errors.push(msg);
        processedIds.add(tx.id);
      }
    }

    return result;
  });
}

async function processTransaction(tx: Transaction, result: FifoRunResult, marginDebt: Map<string, number>, client: PoolClient): Promise<void> {
  switch (tx.operation_type) {
    case 'BUY':
    case 'BUY_FIAT':
    case 'BUY_CRYPTO':
      await processBuy(tx, result, client);
      break;
    case 'MARGIN_BORROW':
      await processIncome(tx, result, client);
      break;
    case 'MARGIN_REPAY':
      await processMarginRepay(tx, result, marginDebt, client);
      break;
    case 'STAKING_REWARD':
    case 'MINING_REWARD':
    case 'LENDING_INTEREST':
    case 'LENDING_INTEREST_LOCKED':
    case 'CASHBACK':
    case 'AIRDROP':
      await processIncome(tx, result, client);
      break;
    case 'FORK':
      await processFork(tx, result, client);
      break;
    case 'SELL':
    case 'SELL_FIAT':
    case 'SELL_CRYPTO':
    case 'GIFT_SENT':
      await processSell(tx, result, client);
      break;
    case 'LOST':
      await processLost(tx, result, client);
      break;
    case 'TRANSFER_INTERNAL':
    case 'WITHDRAW':
      await processTransfer(tx, result, client);
      break;
    case 'STAKING_LOCK':
    case 'STAKING_UNLOCK':
    case 'LAUNCHPOOL_LOCK':
    case 'LAUNCHPOOL_UNLOCK':
      break; // registrado en historial pero sin movimiento FIFO — los lotes permanecen en su wallet
    case 'FEE':
    case 'FEE_NETWORK':
    case 'FEE_EXCHANGE':
      await processFee(tx, result, client);
      break;
    case 'DEPOSIT_CRYPTO':
      // Abre lote al precio de mercado en la fecha del depósito.
      // No es un evento fiscal de income — el coste de adquisición viene de la wallet origen.
      await processIncome(tx, result, client);
      break;
    case 'DEPOSIT_FIAT':
    case 'WITHDRAW_FIAT':   // Retiro a banco — no hay lote que mover
    case 'INTERNAL_TRANSFER':
    case 'IGNORED':
    case 'CONVERT_IN':
    case 'CONVERT_OUT':
      break;
    default:
      result.errors.push(`Tipo de operación no manejado: ${tx.operation_type} (tx ${tx.id})`);
  }
}
