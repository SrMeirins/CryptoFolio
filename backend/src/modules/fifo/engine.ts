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
  walletId: string;
  openTransactionId: string;
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
  wallet_id: string;
  destination_wallet_id: string | null;
  destination_pending: boolean;
}

export interface FifoRunResult {
  lotsCreated: number;
  lotsConsumed: number;
  totalGainEur: number;
  totalLossEur: number;
  errors: string[];
  pendingWithdrawals: number;
}

// Umbrales de tolerancia unificados (antes: 0.0001 / 1e-10 / 1e-6 repartidos por
// el motor sin relación entre sí, dejando una zona gris entre "lote cerrado" y
// "shortfall reportable").
// - FIFO_DUST_EPSILON: por debajo de esto, un lote se considera agotado (polvo de
//   redondeo, no cantidad real). Usado tanto para decidir is_closed como para el
//   filtro de "lotes abiertos" — deben coincidir, o un lote podría quedar marcado
//   is_closed=false pero excluido igualmente por el filtro de cantidad, o viceversa.
// - FIFO_SHORTFALL_EPSILON: por encima de esto, un déficit al consumir lotes es un
//   dato real incompleto (no redondeo) y se reporta como error en vez de ignorarse.
export const FIFO_DUST_EPSILON = 1e-6;
const FIFO_SHORTFALL_EPSILON = 1e-4;

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

  // Binance short-sale quirk: el CSV registra el SELL 1-2 segundos ANTES del MARGIN_BORROW
  // correspondiente, pero económicamente el préstamo precede a la venta.
  // Corrección en memoria: si un MARGIN_BORROW ocurre ≤5s después de un SELL del mismo activo
  // en la misma wallet, adelantamos su timestamp a 1ms antes del SELL.
  // Usamos lista por clave (no Map de un solo valor) para manejar múltiples SELLs del mismo activo.
  const sellsByKey = new Map<string, Transaction[]>(); // key = `${walletId}|${asset}`
  for (const tx of transactions) {
    if (tx.operation_type === 'SELL' || tx.operation_type === 'SELL_FIAT' || tx.operation_type === 'SELL_CRYPTO') {
      const key = `${tx.wallet_id}|${tx.asset}`;
      if (!sellsByKey.has(key)) sellsByKey.set(key, []);
      sellsByKey.get(key)!.push(tx);
    }
  }
  // Cada SELL solo puede emparejarse con UN MARGIN_BORROW (evita que dos préstamos
  // distintos "roben" el mismo SELL). Se elige el SELL más cercano en el tiempo
  // dentro de la ventana, no el primero encontrado — los MARGIN_BORROW se procesan
  // en orden cronológico (orden natural de `transactions`), así que el préstamo más
  // antiguo siempre tiene primera opción sobre los SELL disponibles.
  const usedSells = new Set<string>();
  for (const tx of transactions) {
    if (tx.operation_type !== 'MARGIN_BORROW') continue;
    const sells = sellsByKey.get(`${tx.wallet_id}|${tx.asset}`) ?? [];
    let closestSell: Transaction | null = null;
    let closestDiff = Infinity;
    for (const s of sells) {
      if (usedSells.has(s.id)) continue;
      const diff = tx.timestamp.getTime() - s.timestamp.getTime();
      if (diff > 0 && diff <= 5000 && diff < closestDiff) {
        closestSell = s;
        closestDiff = diff;
      }
    }
    if (closestSell) {
      usedSells.add(closestSell.id);
      tx.timestamp = new Date(closestSell.timestamp.getTime() - 1);
    }
  }
  // Re-ordenar con los timestamps corregidos (estable: conserva el orden DB como desempate)
  const opPriority = (op: string): number => {
    switch (op) {
      case 'MARGIN_BORROW': return 0;
      case 'AIRDROP': case 'DEPOSIT_CRYPTO': case 'STAKING_REWARD': case 'MINING_REWARD':
      case 'LENDING_INTEREST': case 'LENDING_INTEREST_LOCKED': case 'CASHBACK': case 'FORK': return 1;
      case 'TRANSFER_INTERNAL': return 2;
      case 'SELL': case 'SELL_FIAT': case 'SELL_CRYPTO': case 'GIFT_SENT': case 'LOST': return 3;
      case 'BUY': case 'BUY_FIAT': case 'BUY_CRYPTO': return 4;
      case 'WITHDRAW': return 5;
      case 'FEE_EXCHANGE': case 'FEE': case 'FEE_NETWORK': return 6;
      case 'MARGIN_REPAY': return 7;
      default: return 8;
    }
  };
  transactions.sort((a, b) => {
    const tDiff = a.timestamp.getTime() - b.timestamp.getTime();
    if (tDiff !== 0) return tDiff;
    return opPriority(a.operation_type) - opPriority(b.operation_type);
  });

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

// ── BUY ───────────────────────────────────────────────────────────────────
async function processBuy(tx: Transaction, result: FifoRunResult, client: PoolClient): Promise<void> {
  let costBasisEur: number;
  let feeEur = 0;

  if (tx.cost_asset === 'EUR') {
    costBasisEur = tx.cost_amount ?? 0;
  } else if (tx.cost_asset != null) {
    const price = await getHistoricalPriceEur(tx.cost_asset, tx.timestamp);
    costBasisEur = (tx.cost_amount ?? 0) * price;
  } else {
    if (tx.price_per_unit != null && tx.price_per_unit > 0) {
      costBasisEur = tx.amount_net * tx.price_per_unit;
    } else if (tx.cost_amount != null && tx.cost_amount > 0) {
      costBasisEur = tx.cost_amount;
    } else {
      const price = await getHistoricalPriceEur(tx.asset, tx.timestamp);
      costBasisEur = tx.amount_net * price;
    }
  }

  if (tx.fee_asset && tx.fee_amount) {
    if (tx.fee_asset === tx.asset) {
      const unitPriceEur = tx.amount_net > 0 ? costBasisEur / tx.amount_net : 0;
      feeEur = tx.fee_amount * unitPriceEur;
    } else {
      // Fee en activo distinto al comprado (ej: BNB). El valor EUR se añade al
      // cost basis de la compra, y además se consumen los lotes del activo de la fee
      // (es una disposición patrimonial imponible, igual que vender BNB).
      const feePrice = await getHistoricalPriceEur(tx.fee_asset, tx.timestamp);
      feeEur = tx.fee_amount * feePrice;
      await consumeLots(tx.id, tx.fee_asset, tx.wallet_id, tx.fee_amount, feeEur, tx.timestamp, result, client);
    }
    costBasisEur += feeEur;
  }

  const quantity = tx.amount_net;

  // Si se recibe EUR (fiat), no abrimos lote — pero SÍ ejecutamos la permuta
  // para consumir los lotes del activo pagado (ej: XRP→EUR convierte XRP)
  if (quantity <= 0 || tx.asset === 'EUR') {
    // Permuta cripto→EUR: consumir lotes del activo pagado aunque no abramos lote de EUR
    if (tx.asset === 'EUR' && tx.cost_asset && tx.cost_asset !== 'EUR' && tx.cost_amount) {
      await consumeLots(tx.id, tx.cost_asset, tx.wallet_id, tx.cost_amount, costBasisEur, tx.timestamp, result, client);
    }
    return;
  }

  const pricePerUnitEur = quantity > 0 ? costBasisEur / quantity : 0;
  await openLot(tx.asset, quantity, costBasisEur, pricePerUnitEur, feeEur, tx.id, tx.timestamp, tx.wallet_id, client);
  result.lotsCreated++;

  // Permuta: si se pagó con otra cripto, consumir esos lotes
  if (tx.cost_asset && tx.cost_asset !== 'EUR' && tx.cost_asset !== tx.asset && tx.cost_amount) {
    // Si no existe ningún lote previo para este activo en esta wallet, el saldo viene de antes
    // del inicio de la importación. Creamos un lote sintético al precio de mercado para
    // que el coste de adquisición quede registrado y la cadena FIFO continúe sin ruido.
    const openLots = await getOpenLots(tx.cost_asset, tx.wallet_id, client);
    if (openLots.length === 0) {
      const priorHistory = await client.query(
        `SELECT 1 FROM fifo_lots WHERE asset = $1 AND wallet_id = $2 LIMIT 1`,
        [tx.cost_asset, tx.wallet_id]
      );
      if (priorHistory.rows.length === 0) {
        const syntheticPrice = await getHistoricalPriceEur(tx.cost_asset, tx.timestamp);
        await openLot(tx.cost_asset, tx.cost_amount, tx.cost_amount * syntheticPrice, syntheticPrice, 0, tx.id, tx.timestamp, tx.wallet_id, client);
        // Aviso visible (no bloqueante): este saldo puede ser legítimo (previo al inicio
        // de la importación) o una transferencia interna que falte en los datos — merece
        // revisión manual, no debe resolverse en silencio sin dejar rastro.
        result.errors.push(
          `Aviso: lote sintético creado para ${tx.cost_asset} en wallet ${tx.wallet_id} ` +
          `(tx ${tx.id}, ${tx.timestamp.toISOString()}) — sin lotes previos de ese activo en ` +
          `esta wallet, se asumió precio de mercado. Verifica que no falte una transferencia interna.`
        );
      }
    }
    await consumeLots(tx.id, tx.cost_asset, tx.wallet_id, tx.cost_amount, costBasisEur, tx.timestamp, result, client);
  }
}

// ── INCOME ────────────────────────────────────────────────────────────────
async function processIncome(tx: Transaction, result: FifoRunResult, client: PoolClient): Promise<void> {
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
  await openLot(tx.asset, quantity, costBasisEur, pricePerUnitEur, 0, tx.id, tx.timestamp, tx.wallet_id, client);
  result.lotsCreated++;
}

// ── FORK ──────────────────────────────────────────────────────────────────
async function processFork(tx: Transaction, result: FifoRunResult, client: PoolClient): Promise<void> {
  if (tx.asset === 'EUR') return;
  const quantity = tx.amount_net;
  if (quantity <= 0) return;

  await openLot(tx.asset, quantity, 0, 0, 0, tx.id, tx.timestamp, tx.wallet_id, client);
  result.lotsCreated++;
}

// ── SELL ──────────────────────────────────────────────────────────────────
async function processSell(tx: Transaction, result: FifoRunResult, client: PoolClient): Promise<void> {
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
async function processLost(tx: Transaction, result: FifoRunResult, client: PoolClient): Promise<void> {
  await consumeLots(tx.id, tx.asset, tx.wallet_id, tx.amount, 0, tx.timestamp, result, client);
}

// ── MARGIN_REPAY ──────────────────────────────────────────────────────────
// Devolver un préstamo no es disposición patrimonial (NONE).
// Si el repayment supera el principal pendiente (intereses de margen),
// el exceso se registra como LOSS — gasto deducible de G/P.
//
// La deuda pendiente se rastrea en `marginDebt` (mapa en memoria mantenido
// por runFifoEngine) para que la distinción principal/interés sea exacta
// independientemente de qué lote FIFO se consuma en cada momento.
async function processMarginRepay(tx: Transaction, result: FifoRunResult, marginDebt: Map<string, number>, client: PoolClient): Promise<void> {
  if (FIAT_NO_LOT.has(tx.asset)) return;
  const lots = await getOpenLots(tx.asset, tx.wallet_id, client);
  if (lots.length === 0) return; // Sin lotes — silencioso

  const key = `${tx.asset}|${tx.wallet_id}`;
  const debtBefore = marginDebt.get(key) ?? 0;

  // Principal = lo que se devuelve del préstamo; interés = exceso sobre la deuda
  let principalLeft = Math.min(tx.amount, Math.max(0, debtBefore));
  let interestLeft  = tx.amount - principalLeft;

  // Actualizar deuda restante
  marginDebt.set(key, Math.max(0, debtBefore - tx.amount));

  let remaining = tx.amount;

  for (const lot of lots) {
    if (remaining <= 0) break;

    const consumed = Math.min(lot.quantityRemaining, remaining);
    const proportion = consumed / lot.quantityRemaining;
    const costConsumed = lot.costBasisEur * proportion;

    // Calcular cuánto de este consumo es principal y cuánto interés
    const consumedAsPrincipal = Math.min(consumed, principalLeft);
    const consumedAsInterest  = consumed - consumedAsPrincipal;
    principalLeft -= consumedAsPrincipal;

    if (consumedAsInterest === 0) {
      // Todo principal: sin impacto fiscal
      await client.query(
        `INSERT INTO fifo_lot_consumptions (
          lot_id, consuming_transaction_id,
          quantity_consumed, cost_basis_consumed_eur,
          proceeds_eur, gain_loss_eur, fiscal_event_type, consumed_at
        ) VALUES ($1, $2, $3, $4, $4, 0, 'NONE', $5)`,
        [lot.id, tx.id, consumed, costConsumed, tx.timestamp]
      );
    } else if (consumedAsPrincipal === 0) {
      // Todo interés: pérdida deducible
      await client.query(
        `INSERT INTO fifo_lot_consumptions (
          lot_id, consuming_transaction_id,
          quantity_consumed, cost_basis_consumed_eur,
          proceeds_eur, gain_loss_eur, fiscal_event_type, consumed_at
        ) VALUES ($1, $2, $3, $4, 0, $5, 'LOSS', $6)`,
        [lot.id, tx.id, consumed, costConsumed, -costConsumed, tx.timestamp]
      );
    } else {
      // Lote mixto: dividir en dos registros (principal → NONE, interés → LOSS)
      const costPrincipal = costConsumed * (consumedAsPrincipal / consumed);
      const costInterest  = costConsumed - costPrincipal;
      await client.query(
        `INSERT INTO fifo_lot_consumptions (
          lot_id, consuming_transaction_id,
          quantity_consumed, cost_basis_consumed_eur,
          proceeds_eur, gain_loss_eur, fiscal_event_type, consumed_at
        ) VALUES ($1, $2, $3, $4, $4, 0, 'NONE', $5)`,
        [lot.id, tx.id, consumedAsPrincipal, costPrincipal, tx.timestamp]
      );
      await client.query(
        `INSERT INTO fifo_lot_consumptions (
          lot_id, consuming_transaction_id,
          quantity_consumed, cost_basis_consumed_eur,
          proceeds_eur, gain_loss_eur, fiscal_event_type, consumed_at
        ) VALUES ($1, $2, $3, $4, 0, $5, 'LOSS', $6)`,
        [lot.id, tx.id, consumedAsInterest, costInterest, -costInterest, tx.timestamp]
      );
    }

    await updateLot(client, lot.id, lot.quantityRemaining - consumed, lot.costBasisEur - costConsumed);
    result.lotsConsumed++;
    remaining -= consumed;
    interestLeft -= consumedAsInterest;
  }
}

// Activos fiat: nunca tienen lotes FIFO, las transferencias internas son no-ops silenciosas
const FIAT_NO_LOT = new Set(['EUR', 'USD', 'GBP', 'CHF', 'BRL', 'ARS']);

// ── TRANSFER / WITHDRAW ───────────────────────────────────────────────────
// Si destination_pending=true o no hay destination_wallet_id, los lotes se
// quedan en el wallet origen hasta que el usuario asigne el destino.
async function processTransfer(tx: Transaction, result: FifoRunResult, client: PoolClient): Promise<void> {
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

  const toWalletId = tx.destination_wallet_id;
  let quantityToMove = tx.amount;
  const lots = await getOpenLots(tx.asset, tx.wallet_id, client);

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
      [lot.id, tx.id, consumed, costMoved, tx.timestamp]
    );

    await client.query(
      `INSERT INTO fifo_lots (
        asset, quantity_original, quantity_remaining,
        cost_basis_eur, price_per_unit_eur, fee_eur,
        open_transaction_id, opened_at, wallet_id
      ) VALUES ($1, $2, $3, $4, $5, 0, $6, $7, $8)`,
      [tx.asset, consumed, consumed, costMoved, lot.pricePerUnitEur, tx.id, lot.openedAt, toWalletId]
    );

    quantityToMove -= consumed;
  }

  // WITHDRAW externo: cualquier shortfall es un error real (el dinero salió y los lotes deben existir).
  // TRANSFER_INTERNAL: sin impacto fiscal — el shortfall puede deberse a saldo pre-importación
  // o a artefactos de ordering; no afecta al cálculo de G/P.
  if (quantityToMove > FIFO_SHORTFALL_EPSILON && tx.operation_type === 'WITHDRAW') {
    result.errors.push(`TRANSFER sin lotes suficientes para ${tx.asset} tx=${tx.id} (faltan ${quantityToMove.toFixed(6)})`);
  }
}

// ── FEE ───────────────────────────────────────────────────────────────────
async function processFee(tx: Transaction, result: FifoRunResult, client: PoolClient): Promise<void> {
  const feeAsset = tx.fee_asset ?? tx.asset;
  const feeAmount = tx.fee_amount ?? tx.amount;

  if (!feeAsset || feeAmount <= 0) return;

  const priceEur = await getHistoricalPriceEur(feeAsset, tx.timestamp);
  const proceedsEur = feeAmount * priceEur;

  await consumeLots(tx.id, feeAsset, tx.wallet_id, feeAmount, proceedsEur, tx.timestamp, result, client);
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

async function consumeLots(
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

async function updateLot(client: PoolClient, lotId: string, newRemaining: number, newCostBasis: number): Promise<void> {
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
