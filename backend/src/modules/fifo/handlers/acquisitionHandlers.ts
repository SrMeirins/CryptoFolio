import { PoolClient } from 'pg';
import { getHistoricalPriceEur } from '../../prices/binance';
import { Transaction, FifoRunResult } from '../constants';
import { openLot, consumeLots, getOpenLots } from '../lotPrimitives';
import { valorComisionesEnlazadas } from '../comisionesEnlazadas';
import { marcarValoracion, precioTransmision, valorarPermutaEnMomento, type Valoracion } from '../valoracion';

// ── BUY ───────────────────────────────────────────────────────────────────
export async function processBuy(tx: Transaction, result: FifoRunResult, client: PoolClient): Promise<void> {
  let costBasisEur: number;
  let feeEur = 0;
  // Cómo se valoró la permuta (#599), para marcar el consumo de lo entregado.
  let valoracion: Valoracion | null = null;

  if (tx.cost_asset === 'EUR') {
    costBasisEur = tx.cost_amount ?? 0;
  } else if (tx.cost_asset != null && tx.asset === 'EUR') {
    // Venta a EUR registrada como compra de EUR: vale lo que se cobró.
    costBasisEur = tx.amount;
  } else if (tx.cost_asset != null) {
    // Permuta: valor de mercado en el momento, por el lado más líquido (#599).
    valoracion = await valorarPermutaEnMomento(
      { asset: tx.cost_asset, cantidad: tx.cost_amount ?? 0 }, { asset: tx.asset, cantidad: tx.amount }, tx.timestamp);
    costBasisEur = valoracion.valor;
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

  // Valor de lo entregado, sin comisiones: es lo que se transmite del activo
  // pagado (#543). Antes se usaba el coste con la comisión sumada, que inflaba
  // la ganancia de lo entregado justo en el importe de la comisión.
  const valorEntregadoEur = costBasisEur;

  if (tx.fee_asset && tx.fee_amount) {
    if (tx.fee_asset === tx.asset) {
      // Comisión en especie (#543): llega menos cantidad (amount_net) por el mismo
      // pago, así que el coste total no cambia. Se guarda la parte del pago que
      // corresponde a la comisión, para mostrarla aparte como gasto de adquisición.
      const unitPriceEur = tx.asset === 'EUR' ? 1 : tx.amount > 0 ? costBasisEur / tx.amount : 0;
      feeEur = tx.fee_amount * unitPriceEur;
    } else {
      // Fee en activo distinto al comprado (ej: BNB). El valor EUR se añade al
      // cost basis de la compra, y además se consumen los lotes del activo de la fee
      // (es una disposición patrimonial imponible, igual que vender BNB).
      const fee = await precioTransmision(tx.fee_asset, tx.timestamp);
      feeEur = tx.fee_amount * fee.precio;
      await consumeLots(tx.id, tx.fee_asset, tx.wallet_id, tx.fee_amount, feeEur, tx.timestamp, result, client);
      await marcarValoracion(client, tx.id, tx.fee_asset, fee.diario ? 'diario' : 'momento');
      costBasisEur += feeEur;
    }
  }

  // Comisión ya incluida en lo pagado (#415, Bitvavo): el coste no cambia porque
  // ya la contiene; se guarda aparte para mostrarla como gasto de adquisición (#543).
  if (tx.included_fee_asset && tx.included_fee_amount && tx.included_fee_asset === tx.cost_asset) {
    const precio = tx.included_fee_asset === 'EUR' ? 1 : await getHistoricalPriceEur(tx.included_fee_asset, tx.timestamp);
    feeEur += Math.min(tx.included_fee_amount * precio, valorEntregadoEur);
  }

  // Comisiones de la orden en otra moneda (#543): también son coste de la compra.
  const enlazadasEur = await valorComisionesEnlazadas(tx);
  feeEur += enlazadasEur;
  costBasisEur += enlazadasEur;

  const quantity = tx.amount_net;

  // Si se recibe EUR (fiat), no abrimos lote — pero SÍ ejecutamos la permuta
  // para consumir los lotes del activo pagado (ej: XRP→EUR convierte XRP)
  if (quantity <= 0 || tx.asset === 'EUR') {
    // Permuta cripto→EUR: consumir lotes del activo pagado aunque no abramos lote de EUR
    if (tx.asset === 'EUR' && tx.cost_asset && tx.cost_asset !== 'EUR' && tx.cost_amount) {
      // Venta a EUR: la comisión es gasto de transmisión, se resta de lo obtenido.
      await consumeLots(tx.id, tx.cost_asset, tx.wallet_id, tx.cost_amount, valorEntregadoEur - feeEur, tx.timestamp, result, client);
      await marcarValoracion(client, tx.id, tx.cost_asset, 'momento');
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
        result.warnings.push(
          `Aviso: lote sintético creado para ${tx.cost_asset} en wallet ${tx.wallet_id} ` +
          `(tx ${tx.id}, ${tx.timestamp.toISOString()}) — sin lotes previos de ese activo en ` +
          `esta wallet, se asumió precio de mercado. Verifica que no falte una transferencia interna.`
        );
      }
    }
    await consumeLots(tx.id, tx.cost_asset, tx.wallet_id, tx.cost_amount, valorEntregadoEur, tx.timestamp, result, client);
    if (valoracion) await marcarValoracion(client, tx.id, tx.cost_asset, valoracion.criterio, valoracion);
  }
}

// ── INCOME ────────────────────────────────────────────────────────────────
export async function processIncome(tx: Transaction, result: FifoRunResult, client: PoolClient): Promise<void> {
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
export async function processFork(tx: Transaction, result: FifoRunResult, client: PoolClient): Promise<void> {
  if (tx.asset === 'EUR') return;
  const quantity = tx.amount_net;
  if (quantity <= 0) return;

  await openLot(tx.asset, quantity, 0, 0, 0, tx.id, tx.timestamp, tx.wallet_id, client);
  result.lotsCreated++;
}
