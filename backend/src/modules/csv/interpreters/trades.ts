import { RawCsvRow, ParsedTransaction } from '../types';
import { abs, FIAT_ASSETS } from '../csvUtils';
import { getHistoricalPriceEur } from '../../prices/binance';

// ── Comisiones de una orden (#543) ─────────────────────────────────────────
// Binance escribe una línea «Transaction Fee» por fill, con la misma hora que
// el fill. Con «pagar comisiones con BNB» activo, unos fills cobran en BNB y
// otros (cuando no queda BNB) en el activo de la orden. La transacción solo
// guarda una comisión: va la de un activo del par si la hay; cada moneda
// restante sale como FEE_EXCHANGE enlazada a la orden, que el FIFO cuenta como
// gasto de esa compra o venta.
export interface RepartoComisiones {
  feeAsset?: string;
  feeAmount?: number;
  /** Comisiones en otras monedas, una entrada por moneda. */
  otras: { coin: string; amount: number; rows: RawCsvRow[] }[];
}

export function repartirComisiones(feeRows: readonly RawCsvRow[], par: readonly string[]): RepartoComisiones {
  const porMoneda = new Map<string, RawCsvRow[]>();
  for (const r of feeRows) porMoneda.set(r.coin, [...(porMoneda.get(r.coin) ?? []), r]);
  if (porMoneda.size === 0) return { otras: [] };
  const monedas = [...porMoneda.keys()];
  const principal = par.find(c => porMoneda.has(c)) ?? monedas[0];
  const suma = (rows: RawCsvRow[]) => rows.reduce((s, r) => s + abs(r.change), 0);
  return {
    feeAsset: principal,
    feeAmount: suma(porMoneda.get(principal)!),
    otras: monedas.filter(c => c !== principal).map(coin => ({ coin, amount: suma(porMoneda.get(coin)!), rows: porMoneda.get(coin)! })),
  };
}

/** Hashes de la orden sin los de sus comisiones en otras monedas, que van en su propia transacción. */
function hashesSinOtras(hashes: readonly string[], reparto: RepartoComisiones): string[] {
  const fuera = new Set(reparto.otras.flatMap(o => o.rows.map(r => r.rowHash)));
  return hashes.filter(h => !fuera.has(h));
}

/** FEE_EXCHANGE de una comisión en otra moneda, enlazada a su orden. */
function comisionEnlazada(
  otra: RepartoComisiones['otras'][number], orden: ParsedTransaction, lado: 'BUY' | 'SELL',
): ParsedTransaction {
  return {
    operationType: 'FEE_EXCHANGE',
    timestamp:     orden.timestamp,
    asset:         otra.coin,
    amount:        otra.amount,
    amountNet:     otra.amount,
    account:       orden.account,
    notes:         `Fee en ${otra.coin} para ${lado} ${orden.asset}`,
    subTradeCount: otra.rows.length,
    rawRowHashes:  otra.rows.map(r => r.rowHash),
    comisionDe:    orden.rawRowHashes[0],
  };
}

/** La orden y, detrás, sus comisiones en otras monedas. */
function conComisiones(
  orden: ParsedTransaction, reparto: RepartoComisiones, lado: 'BUY' | 'SELL',
): ParsedTransaction | ParsedTransaction[] {
  if (reparto.otras.length === 0) return orden;
  return [orden, ...reparto.otras.map(o => comisionEnlazada(o, orden, lado))];
}

// ── Swap de 2 filas (entrada + salida → BUY) ───────────────────────────────
// Binance Convert y los dos handlers de ETH 2.0 Staking son estructuralmente
// idénticos (1 fila de entrada + 1 de salida al mismo timestamp → permuta),
// solo difieren en el texto de la nota/error y en qué hacer si falta una fila
// (Convert nunca debería quedar incompleto → error; ETH 2.0 Staking sí puede
// tener una fila suelta real → se ignora en silencio). Antes eran 3 bloques
// casi idénticos de ~15-25 líneas cada uno.
interface TwoRowSwapConfig {
  label: string;
  onIncomplete: 'throw' | 'ignore';
}

function interpretTwoRowSwap(
  group: RawCsvRow[], hashes: string[], timestamp: Date, account: string, config: TwoRowSwapConfig
): ParsedTransaction | ParsedTransaction[] {
  // Se asume siempre 1 fila de entrada + 1 de salida. Si Binance añadiera una
  // 3ª fila (p. ej. un fee en un activo aparte) hoy se perdería o confundiría
  // en silencio — se prefiere fallar explícito y forzar revisión manual.
  if (group.length > 2) {
    throw new Error(`${config.label} con ${group.length} filas (esperadas 2) en ${timestamp.toISOString()} — revisión manual necesaria, posible fee no capturado`);
  }

  const inRow  = group.find((r) => r.change > 0);
  const outRow = group.find((r) => r.change < 0);

  if (!inRow || !outRow) {
    if (config.onIncomplete === 'ignore') return []; // fila suelta real → ignorar
    throw new Error(`${config.label} incompleto en ${timestamp.toISOString()}`);
  }

  const amountIn  = abs(inRow.change);
  const amountOut = abs(outRow.change);

  return {
    operationType: 'BUY',
    timestamp,
    asset: inRow.coin,
    amount: amountIn,
    amountNet: amountIn,
    costAsset: outRow.coin,
    costAmount: amountOut,
    pricePerUnit: amountOut / amountIn,
    account,
    notes: `${config.label}: ${outRow.coin}→${inRow.coin}`,
    subTradeCount: 1,
    rawRowHashes: hashes,
  };
}

export function interpretConvert(
  group: RawCsvRow[], hashes: string[], timestamp: Date, account: string
): ParsedTransaction | ParsedTransaction[] {
  return interpretTwoRowSwap(group, hashes, timestamp, account, { label: 'Binance Convert', onIncomplete: 'throw' });
}

// ETH 2.0 Staking: ETH → BETH (1:1, mismo timestamp). Tratamiento: swap/convert
// — se consume el lote de ETH y se abre lote de BETH al precio de mercado del
// día. El G/P se calcula como en cualquier permuta cripto↔cripto.
export function interpretEthStaking(
  group: RawCsvRow[], hashes: string[], timestamp: Date, account: string
): ParsedTransaction | ParsedTransaction[] {
  return interpretTwoRowSwap(group, hashes, timestamp, account, { label: 'ETH 2.0 Staking', onIncomplete: 'ignore' });
}

// ETH 2.0 Staking Withdrawals: BETH → ETH (1:1, mismo timestamp). Swap inverso.
export function interpretEthStakingWithdrawals(
  group: RawCsvRow[], hashes: string[], timestamp: Date, account: string
): ParsedTransaction | ParsedTransaction[] {
  return interpretTwoRowSwap(group, hashes, timestamp, account, { label: 'ETH 2.0 Staking Withdrawals', onIncomplete: 'ignore' });
}

export function interpretSoldRevenue(
  group: RawCsvRow[], hashes: string[], timestamp: Date, account: string
): ParsedTransaction | ParsedTransaction[] {
  const soldRows    = group.filter((r) => r.operation === 'Transaction Sold');
  const revenueRows = group.filter((r) => r.operation === 'Transaction Revenue');
  const feeRows     = group.filter((r) => r.operation === 'Transaction Fee');

  if (soldRows.length === 0 || revenueRows.length === 0) {
    throw new Error(`Transaction Sold/Revenue incompleto en ${timestamp.toISOString()}`);
  }

  // Validar que todos los fills son del mismo activo vendido.
  // Si hay distintos activos vendidos al mismo segundo (dos órdenes distintas),
  // es un caso no soportado — mejor un error explícito que datos incorrectos.
  const soldAssets = [...new Set(soldRows.map(r => r.coin))];
  if (soldAssets.length > 1) {
    throw new Error(
      `Transaction Sold con múltiples activos distintos al mismo timestamp (${timestamp.toISOString()}): ` +
      `${soldAssets.join(', ')} — no soportado, revisa manualmente.`
    );
  }

  // Sumar TODOS los fills (Binance divide órdenes grandes en múltiples filas)
  const soldAsset    = soldRows[0].coin;
  const revenueAsset = revenueRows[0].coin;
  const totalSold    = soldRows.reduce((s, r) => s + abs(r.change), 0);
  const totalRevenue = revenueRows.reduce((s, r) => s + abs(r.change), 0);

  // Comisiones de los fills (#543): la del par en la venta; otras monedas, enlazadas.
  const reparto = repartirComisiones(feeRows, [revenueAsset, soldAsset]);

  const venta: ParsedTransaction = {
    operationType: 'SELL',
    timestamp,
    asset:        soldAsset,
    amount:       totalSold,
    amountNet:    totalSold,
    costAsset:    revenueAsset,
    costAmount:   totalRevenue,
    pricePerUnit: totalSold > 0 ? totalRevenue / totalSold : 0,
    feeAsset:     reparto.feeAsset,
    feeAmount:    reparto.feeAmount,
    account,
    notes: soldRows.length > 1 ? `${soldRows.length} fills parciales` : undefined,
    subTradeCount: soldRows.length,
    rawRowHashes: hashesSinOtras(hashes, reparto),
  };
  return conComisiones(venta, reparto, 'SELL');
}

export function interpretBuyCryptoWithFiat(
  group: RawCsvRow[], hashes: string[], timestamp: Date, account: string
): ParsedTransaction {
  // La fila negativa es lo que se pagó (EUR u otro fiat)
  // La fila positiva es lo que se recibió (cripto)
  const paidRow     = group.find((r) => r.change < 0);
  const receivedRow = group.find((r) => r.change > 0);

  if (!paidRow || !receivedRow) {
    // Compra huérfana (#435): solo consta la cripto recibida, sin la fila del
    // pago (pagada con tarjeta o banco fuera del saldo de Binance, o fuera del
    // periodo exportado). Es una compra, nunca un rendimiento: se pide el coste
    // en la revisión al importar, con el precio de mercado del día como propuesta.
    const row = group.find((r) => r.change > 0) ?? group[0];
    return {
      operationType: 'BUY',
      timestamp,
      asset: row.coin,
      amount: abs(row.change),
      amountNet: abs(row.change),
      costAsset: 'EUR',
      account,
      notes: `${row.operation}: el pago en EUR no está en el CSV (pagado fuera del saldo de Binance); coste indicado en la revisión o a precio de mercado`,
      subTradeCount: 1,
      rawRowHashes: hashes,
      needsCostReview: true,
      orphanFiatBuy: true,
    };
  }

  return {
    operationType: 'BUY',
    timestamp:    receivedRow.time,
    asset:        receivedRow.coin,
    amount:       abs(receivedRow.change),
    amountNet:    abs(receivedRow.change),
    costAsset:    paidRow.coin,
    costAmount:   abs(paidRow.change),
    pricePerUnit: abs(paidRow.change) / abs(receivedRow.change),
    account,
    notes: paidRow.remark ? `${group[0]?.operation ?? ''} vía ${paidRow.remark}` : undefined,
    subTradeCount: 1,
    rawRowHashes: hashes,
  };
}

export function interpretSmallAssetsExchange(
  group: RawCsvRow[], _hashes: string[], timestamp: Date, account: string
): ParsedTransaction[] {
  // Binance puede convertir varios activos a BNB simultáneamente (mismo timestamp).
  // Cada conversión tiene un remark distinto ("USDC to BNB", "EUR to BNB", etc.).
  // Agrupamos por remark para producir una transacción BUY por cada par.
  const byRemark = new Map<string, RawCsvRow[]>();
  for (const row of group) {
    const key = row.remark || '_noRemark';
    if (!byRemark.has(key)) byRemark.set(key, []);
    byRemark.get(key)!.push(row);
  }

  const results: ParsedTransaction[] = [];

  for (const [, rows] of byRemark) {
    // Cada remark debe tener exactamente 1 fila de entrada + 1 de salida. Si
    // hubiera una 3ª (p. ej. un fee), hoy se perdería/confundiría en silencio
    // — se prefiere fallar explícito (ver interpretTwoRowSwap, mismo criterio).
    if (rows.length > 2) {
      throw new Error(`Small Assets Exchange con ${rows.length} filas (esperadas 2) en ${timestamp.toISOString()} — revisión manual necesaria, posible fee no capturado`);
    }

    const inRow  = rows.find((r) => r.change > 0);
    const outRow = rows.find((r) => r.change < 0);

    if (!inRow || !outRow) continue;

    results.push({
      operationType: 'BUY',
      timestamp,
      asset:        inRow.coin,
      amount:       abs(inRow.change),
      amountNet:    abs(inRow.change),
      costAsset:    outRow.coin,
      costAmount:   abs(outRow.change),
      pricePerUnit: abs(outRow.change) / abs(inRow.change),
      account,
      notes:        `Small Assets Exchange: ${outRow.coin}→${inRow.coin} (dust)`,
      subTradeCount: 1,
      rawRowHashes: rows.map((r) => r.rowHash),
    });
  }

  if (results.length === 0) {
    throw new Error(`Small Assets Exchange sin pares válidos en ${timestamp.toISOString()}`);
  }

  return results;
}

export async function interpretTransactionBuy(
  group: RawCsvRow[], hashes: string[], timestamp: Date, account: string
): Promise<ParsedTransaction | ParsedTransaction[]> {
  const buyRows   = group.filter((r) => r.operation === 'Transaction Buy');
  const spendRows = group.filter((r) => r.operation === 'Transaction Spend');
  const feeRows   = group.filter((r) => r.operation === 'Transaction Fee');

  const buyAssets   = [...new Set(buyRows.map((r) => r.coin))];
  const spendAssets = [...new Set(spendRows.map((r) => r.coin))];

  // Detectar SELL encubierta: en margin, Binance a veces emite Transaction Buy con
  // importe negativo (el activo sale) y Transaction Spend con importe positivo (recibes).
  // Ej: Transaction Buy XRP -612.5 + Transaction Spend USDC +1262.85 = SELL de XRP
  const totalBoughtSigned = buyRows.reduce((s, r) => s + r.change, 0);
  const totalSpentSigned  = spendRows.reduce((s, r) => s + r.change, 0);

  if (totalBoughtSigned < 0 && totalSpentSigned > 0 && buyAssets.length === 1) {
    // Es una SELL: el activo del "buy" (con signo negativo) se vende,
    // el activo del "spend" (con signo positivo) son los proceeds.
    const soldAsset   = buyAssets[0];
    const totalSold   = abs(totalBoughtSigned);
    const totalProc   = abs(totalSpentSigned);
    // Antes se sumaban comisiones de monedas distintas en una sola (#543).
    const reparto     = repartirComisiones(feeRows, [spendAssets[0], soldAsset]);

    const venta: ParsedTransaction = {
      operationType: 'SELL',
      timestamp,
      asset:        soldAsset,
      amount:       totalSold,
      amountNet:    totalSold,
      costAsset:    spendAssets[0],
      costAmount:   totalProc,
      pricePerUnit: totalSold > 0 ? totalProc / totalSold : 0,
      feeAsset:     reparto.feeAsset,
      feeAmount:    reparto.feeAmount,
      account,
      notes:        'Venta en margen (Transaction Buy con signo negativo)',
      subTradeCount: buyRows.length,
      rawRowHashes: hashesSinOtras(hashes, reparto),
    };
    return conComisiones(venta, reparto, 'SELL');
  }

  if (buyAssets.length > 1) {
    return await interpretMultiAssetBuy(group, timestamp, account);
  }

  const asset     = buyAssets[0];
  const costAsset = spendAssets[0] ?? 'EUR';

  const totalBought = buyRows.reduce((s, r) => s + abs(r.change), 0);
  const totalSpent  = spendRows.reduce((s, r) => s + abs(r.change), 0);

  // Comisiones de los fills (#543): la del activo comprado (o la del pagado) en
  // la compra; si hay otra moneda (BNB), sale enlazada como gasto de la compra.
  const reparto      = repartirComisiones(feeRows, [asset, costAsset]);
  const feeEnActivo  = reparto.feeAsset === asset ? (reparto.feeAmount ?? 0) : 0;
  const amountNet    = totalBought - feeEnActivo;
  const pricePerUnit = totalSpent / totalBought;

  const buyTx: ParsedTransaction = {
    operationType: 'BUY',
    timestamp,
    asset,
    amount: totalBought,
    amountNet,
    costAsset,
    costAmount: totalSpent,
    pricePerUnit,
    feeAsset:  reparto.feeAsset,
    feeAmount: reparto.feeAmount,
    account,
    subTradeCount: buyRows.length,
    rawRowHashes: hashesSinOtras(hashes, reparto),
  };
  return conComisiones(buyTx, reparto, 'BUY');
}

async function interpretMultiAssetBuy(
  group: RawCsvRow[], timestamp: Date, account: string
): Promise<ParsedTransaction[]> {
  const buyRows   = group.filter((r) => r.operation === 'Transaction Buy');
  const spendRows = group.filter((r) => r.operation === 'Transaction Spend');
  const feeRows   = group.filter((r) => r.operation === 'Transaction Fee');

  const byAsset = new Map<string, RawCsvRow[]>();
  for (const row of buyRows) {
    if (!byAsset.has(row.coin)) byAsset.set(row.coin, []);
    byAsset.get(row.coin)!.push(row);
  }

  const totalSpent   = spendRows.reduce((s, r) => s + abs(r.change), 0);
  const costAsset     = spendRows[0]?.coin ?? 'USDC';
  const feeOtherRows  = feeRows.filter((r) => !byAsset.has(r.coin));

  // Reparto por VALOR real (cantidad × precio de mercado en el momento de la
  // operación), no por cantidad bruta — sumar 0.01 BTC + 500 XRP como si
  // fueran unidades comparables no tiene significado económico. Un precio
  // histórico por activo distinto en el grupo (típicamente 2, nunca decenas).
  const assetQuantities = [...byAsset.entries()].map(([asset, rows]) => ({
    asset,
    rows,
    quantity: rows.reduce((s, r) => s + abs(r.change), 0),
  }));
  const priceByAsset = new Map<string, number>();
  for (const { asset } of assetQuantities) {
    priceByAsset.set(asset, await getHistoricalPriceEur(asset, timestamp));
  }
  const totalValueEur = assetQuantities.reduce(
    (s, a) => s + a.quantity * priceByAsset.get(a.asset)!, 0
  );

  return assetQuantities.map(({ asset, rows, quantity: assetTotal }) => {
    const assetValueEur     = assetTotal * priceByAsset.get(asset)!;
    const proportion        = totalValueEur > 0 ? assetValueEur / totalValueEur : 0;
    const proportionalSpend = totalSpent * proportion;

    const feesInAsset  = feeRows.filter((r) => r.coin === asset);
    const feeInAssetTotal = feesInAsset.reduce((s, r) => s + abs(r.change), 0);
    const feeOtherTotal   = feeOtherRows.reduce((s, r) => s + abs(r.change), 0) * proportion;
    const feeOtherAsset   = feeOtherRows[0]?.coin;

    return {
      operationType: 'BUY' as const,
      timestamp,
      asset,
      amount: assetTotal,
      amountNet: assetTotal - feeInAssetTotal,
      costAsset,
      costAmount: proportionalSpend,
      pricePerUnit: proportionalSpend / assetTotal,
      feeAsset:  feeInAssetTotal > 0 ? asset : feeOtherAsset,
      feeAmount: feeInAssetTotal > 0 ? feeInAssetTotal : (feeOtherTotal > 0 ? feeOtherTotal : undefined),

      account,
      subTradeCount: rows.length,
      rawRowHashes: rows.map((r) => r.rowHash),
    };
  });
}

export function interpretTransactionSell(
  group: RawCsvRow[], hashes: string[], timestamp: Date, account: string
): ParsedTransaction | ParsedTransaction[] {
  // Binance puede dividir una venta grande en varios fills al mismo segundo —
  // sumar todas las filas de venta y de contrapartida, igual que ya hace
  // interpretSoldRevenue para Transaction Sold/Revenue, en vez de tomar solo
  // la primera con find(). Las comisiones del mismo instante se agrupan con la
  // venta (#543) y se reparten como en el resto de órdenes.
  const sellRows    = group.filter((r) => r.operation === 'Transaction Sell' && r.change < 0);
  const receiveRows = group.filter((r) => r.change > 0 && r.operation !== 'Transaction Fee');
  const feeRows     = group.filter((r) => r.operation === 'Transaction Fee');

  if (sellRows.length === 0) {
    throw new Error(`Transaction Sell sin fila de venta en ${timestamp.toISOString()}`);
  }

  const soldAsset = sellRows[0].coin;
  const totalSold = sellRows.reduce((s, r) => s + abs(r.change), 0);
  const receiveAsset  = receiveRows[0]?.coin;
  const totalReceived = receiveRows.length > 0 ? receiveRows.reduce((s, r) => s + abs(r.change), 0) : undefined;

  const reparto = repartirComisiones(feeRows, receiveAsset ? [receiveAsset, soldAsset] : [soldAsset]);

  const venta: ParsedTransaction = {
    operationType: 'SELL',
    timestamp,
    asset: soldAsset,
    amount: totalSold,
    amountNet: totalSold,
    costAsset:  receiveAsset,
    costAmount: totalReceived,
    feeAsset:  reparto.feeAsset,
    feeAmount: reparto.feeAmount,
    account,
    notes: sellRows.length > 1 ? `${sellRows.length} fills parciales` : undefined,
    subTradeCount: sellRows.length,
    rawRowHashes: hashesSinOtras(hashes, reparto),
  };
  return conComisiones(venta, reparto, 'SELL');
}

export function interpretTransactionRelated(
  group: RawCsvRow[], hashes: string[], timestamp: Date, account: string
): ParsedTransaction {
  const cryptoRow = group.find(r => !FIAT_ASSETS.has(r.coin.toUpperCase()) && r.change > 0);
  const fiatRow   = group.find(r => FIAT_ASSETS.has(r.coin.toUpperCase()) && r.change < 0);

  if (!cryptoRow || !fiatRow) {
    throw new Error(
      `Transaction Related con patrón no reconocido en ${timestamp.toISOString()}: ` +
      group.map(r => `${r.coin} ${r.change}`).join(' | ')
    );
  }

  return {
    operationType: 'BUY',
    timestamp,
    asset:        cryptoRow.coin,
    amount:       abs(cryptoRow.change),
    amountNet:    abs(cryptoRow.change),
    costAsset:    fiatRow.coin,
    costAmount:   abs(fiatRow.change),
    pricePerUnit: abs(fiatRow.change) / abs(cryptoRow.change),
    account,
    notes:        'Compra via depósito directo (Transaction Related)',
    subTradeCount: 1,
    rawRowHashes: hashes,
  };
}
