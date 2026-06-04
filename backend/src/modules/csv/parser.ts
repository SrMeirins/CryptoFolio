import { createHash } from 'crypto';
import { parse } from 'csv-parse/sync';
import {
  RawCsvRow,
  ParsedTransaction,
  CsvParseResult,
  ParseError,
} from './types';
import { preprocess } from './preprocessor';
import { detectLanguage, normalizeHeaders } from './languages';
import { ALL_IGNORED_OPERATIONS } from './binanceAccounts';

// Importado desde binanceAccounts.ts — fuente de verdad única
const IGNORED_OPERATIONS = ALL_IGNORED_OPERATIONS;

// Transferencias internas que se interpretan como TRANSFER_INTERNAL (negativo)
// o IGNORED (positivo — el FIFO crea el lote destino automáticamente)
const INTERNAL_TRANSFER_OPS = new Set([
  'Transfer Between Main and Funding Wallet',
  'Transfer Between Main Account/Futures and Margin Account',
]);

// Fiat real — depósitos/retiros de estas monedas no tienen lote FIFO
const FIAT_ASSETS = new Set(['EUR', 'USD', 'GBP', 'CHF', 'USDT_FIAT']);

// Operaciones de compra EUR→cripto que siguen el patrón de dos filas (gasto + ingreso)
const FIAT_BUY_OPS = new Set([
  'Buy Crypto With Fiat',
  'Buy Crypto With Card',
  'Convert Fiat to Crypto OCBS',
]);

// Mapa de operaciones de Binance → tipo fiscal (income/airdrops/cashback)
const INCOME_OPS: Record<string, 'STAKING_REWARD' | 'LENDING_INTEREST' | 'CASHBACK' | 'AIRDROP'> = {
  'Staking Rewards':                'STAKING_REWARD',
  'ETH 2.0 Staking Rewards':        'STAKING_REWARD',
  'Simple Earn Flexible Interest':  'LENDING_INTEREST',
  'Simple Earn Locked Rewards':     'STAKING_REWARD',
  'Savings Interest':               'LENDING_INTEREST',
  'POS savings interest':           'LENDING_INTEREST',
  'Launchpool Interest':            'STAKING_REWARD',
  'BNB Vault Rewards':              'STAKING_REWARD',
  'Airdrop Assets':                 'AIRDROP',
  'Asset Recovery':                 'AIRDROP',
  'Distribution':                   'AIRDROP',
  'Cash Voucher Distribution':      'CASHBACK',
  'Commission Rebate':              'CASHBACK',
  'Referral Kickback':              'CASHBACK',
  'Crypto Box':                     'CASHBACK',
  'Mission Reward Distribution':    'CASHBACK',
};

function parseDate(raw: string): Date {
  const normalized = '20' + raw.trim();
  const d = new Date(normalized.replace(' ', 'T') + 'Z');
  if (isNaN(d.getTime())) throw new Error(`Fecha inválida: ${raw}`);
  return d;
}

function rowHash(row: Record<string, string>): string {
  const key = [
    row['User ID'] ?? '',
    row['Time'] ?? '',
    row['Account'] ?? '',
    row['Operation'] ?? '',
    row['Coin'] ?? '',
    row['Change'] ?? '',
    row['Remark'] ?? '',
  ].join('|');
  return createHash('sha256').update(key).digest('hex');
}

function abs(n: number): number {
  return Math.abs(n);
}

function groupByTimestamp(rows: RawCsvRow[]): Map<string, RawCsvRow[]> {
  const groups = new Map<string, RawCsvRow[]>();

  for (const row of rows) {
    const ts = row.time.getTime();
    let found = false;

    for (const [key, group] of groups) {
      const groupTs = parseInt(key.split('|')[0]);
      const sameAccount = group[0].account === row.account;
      const sameMainOp = mainOpType(group[0].operation) === mainOpType(row.operation);

      // Binance Convert puede tener 1 segundo de diferencia entre sus filas.
      // Para Transaction*, todos los rows son siempre el mismo segundo exacto,
      // así que 0ms evita mezclar órdenes distintas que ocurran en el mismo segundo.
      const windowMs = mainOpType(row.operation) === 'BinanceConvert' ? 1500 : 0;
      if (Math.abs(ts - groupTs) <= windowMs && sameMainOp && sameAccount) {
        group.push(row);
        found = true;
        break;
      }
    }

    if (!found) {
      const key = `${ts}|${mainOpType(row.operation)}|${row.account}`;
      groups.set(key, [row]);
    }
  }

  return groups;
}

function mainOpType(operation: string): string {
  // Compras: Buy + Spend + Fee (fee puede acompañar a cualquiera, pero en la práctica
  // solo aparece junto a Transaction Buy o Transaction Sold al mismo timestamp)
  if (['Transaction Buy', 'Transaction Spend', 'Transaction Fee'].includes(operation)) return 'TransactionBuy';
  // Ventas
  if (['Transaction Sold', 'Transaction Revenue', 'Transaction Sell'].includes(operation)) return 'TransactionSell';
  if (operation === 'Binance Convert') return 'BinanceConvert';
  if (operation === 'Small Assets Exchange BNB') return 'SmallAssetsExchange';
  return operation;
}

// ── Parser principal ───────────────────────────────────────────────────────
export function parseBinanceCsv(fileContent: Buffer | string): CsvParseResult {
  const errors: ParseError[] = [];
  const ignoredRows: RawCsvRow[] = [];

  // 1. Parsear CSV raw con cabeceras originales
  const rawRecords: Record<string, string>[] = parse(fileContent, {
    columns: true,
    skip_empty_lines: true,
    bom: true,
    trim: true,
  });

  if (rawRecords.length === 0) {
    return {
      transactions: [],
      ignoredRows: [],
      errors: [],
      stats: { totalRows: 0, parsedRows: 0, ignoredRows: 0, errorRows: 0, transactionCount: 0 },
    };
  }

  // 2. Detectar idioma y normalizar cabeceras
  const originalHeaders = Object.keys(rawRecords[0]);
  const lang = detectLanguage(originalHeaders);
  const normalizedHeaders = normalizeHeaders(originalHeaders, lang);

  // Remap registros con cabeceras normalizadas
  const records: Record<string, string>[] = rawRecords.map((raw) => {
    const normalized: Record<string, string> = {};
    originalHeaders.forEach((orig, i) => {
      normalized[normalizedHeaders[i]] = raw[orig];
    });
    return normalized;
  });

  // 3. Normalizar filas
  const rows: RawCsvRow[] = [];
  for (const record of records) {
    try {
      rows.push({
        userId:    record['User ID'] ?? '',
        time:      parseDate(record['Time']),
        account:   record['Account'] ?? '',
        operation: record['Operation'] ?? '',
        coin:      record['Coin'] ?? '',
        change:    parseFloat(record['Change'] ?? '0'),
        remark:    record['Remark'] ?? '',
        rowHash:   rowHash(record),
      });
    } catch (e) {
      errors.push({
        rows: [],
        message: `Error parseando fila: ${JSON.stringify(record)} — ${(e as Error).message}`,
      });
    }
  }

  // 3b. Detectar "margin short sales": Margin Loan + Transaction Sold del MISMO activo
  //     en el MISMO timestamp y cuenta → la venta es de ACTIVO PRESTADO, no propio.
  //
  //     IMPORTANTE: solo se ignora si el total vendido ≤ total prestado (con tolerancia).
  //     Si se vende MÁS de lo prestado, el exceso es una venta real del activo propio.
  //
  //     Ejemplo correcto (XRP):  préstamo 508.5 = vendido 508.5 → TODO ignorado
  //     Ejemplo con exceso (LUNC): préstamo 4M < vendido 5M → NO ignorar nada
  //       (el 1M extra es LUNC propio que se vendió junto al short)
  {
    // Calcular totales de Margin Loan por "timestamp|account|asset"
    const loanTotals = new Map<string, number>();
    for (const row of rows) {
      if (row.operation === 'Margin Loan') {
        const key = `${row.time.getTime()}|${row.account}|${row.coin}`;
        loanTotals.set(key, (loanTotals.get(key) ?? 0) + abs(row.change));
      }
    }

    // Calcular totales de Transaction Sold por "timestamp|account|asset"
    const soldTotals = new Map<string, number>();
    for (const row of rows) {
      if (row.operation === 'Transaction Sold') {
        const key = `${row.time.getTime()}|${row.account}|${row.coin}`;
        soldTotals.set(key, (soldTotals.get(key) ?? 0) + abs(row.change));
      }
    }

    // Contextos donde sold ≤ loan → short sale puro, ignorar.
    //
    // IMPORTANTE: solo se crea contexto si hay un Transaction Sold real (soldAmt > 0).
    // Un Margin Loan sin Transaction Sold correspondiente es una compra apalancada
    // (loan USDT para comprar cripto), NO un short sale — no se debe suprimir nada.
    //
    // Usamos comparación estricta (sold ≤ loan, sin tolerancia):
    //   - sold ≤ loan: short sale puro → ignorar todo
    //   - sold > loan: hay activo propio mezclado (aunque sea 0.003 de diferencia)
    //     → procesar como SELL real. El FIFO consumirá los lotes propios disponibles
    //     y logueará "insuficiente" para la parte prestada (que no tiene lotes).
    //
    // shortSaleCoinContexts → clave ts|account|coin: para Transaction Sold (mismo activo)
    // shortSaleTimestamps   → clave ts|account:       para Transaction Revenue y Fee
    //                         (pueden estar en activo distinto al prestado)
    const shortSaleCoinContexts = new Set<string>();
    const shortSaleTimestamps   = new Set<string>();
    for (const [key, loanAmt] of loanTotals) {
      const soldAmt = soldTotals.get(key) ?? 0;
      if (soldAmt === 0) continue; // Sin Transaction Sold → no hay short sale
      if (soldAmt <= loanAmt) {
        // Short sale puro: todo lo vendido estaba prestado → ignorar
        shortSaleCoinContexts.add(key); // ts|account|coin
        const [ts, account] = key.split('|');
        shortSaleTimestamps.add(`${ts}|${account}`);
      }
      // Si sold > loan: activo propio mezclado → dejar como SELL normal para que el
      // FIFO consuma los lotes propios (el exceso sobre el préstamo es una venta real)
    }

    // Reemplazar operación de las filas Transaction Sold/Revenue/Fee en esos contextos
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const ctxCoin = `${row.time.getTime()}|${row.account}|${row.coin}`;
      const ctxTs   = `${row.time.getTime()}|${row.account}`;
      const suppress =
        (row.operation === 'Transaction Sold'    && shortSaleCoinContexts.has(ctxCoin)) ||
        (row.operation === 'Transaction Revenue' && shortSaleTimestamps.has(ctxTs)) ||
        (row.operation === 'Transaction Fee'     && shortSaleTimestamps.has(ctxTs));
      if (suppress) {
        rows[i] = { ...row, operation: 'Margin Short Sale' };
      }
    }
  }

  // 4. Separar ignoradas (movimientos internos sin impacto fiscal)
  const activeRows: RawCsvRow[] = [];
  for (const row of rows) {
    if (IGNORED_OPERATIONS.has(row.operation) || row.operation === 'Margin Short Sale') {
      ignoredRows.push(row);
    } else {
      activeRows.push(row);
    }
  }

  // 5. Pre-procesar (Buy Crypto With Fiat linking)
  const preprocessedRows = preprocess(activeRows);

  // 6. Agrupar por timestamp
  const groups = groupByTimestamp(preprocessedRows);

  // 7. Interpretar cada grupo
  const transactions: ParsedTransaction[] = [];

  for (const [, group] of groups) {
    try {
      const parsed = interpretGroup(group);
      if (parsed) {
        if (Array.isArray(parsed)) {
          transactions.push(...parsed);
        } else {
          transactions.push(parsed);
        }
      } else {
        ignoredRows.push(...group);
      }
    } catch (e) {
      errors.push({
        rows: group,
        message: (e as Error).message,
      });
    }
  }

  transactions.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

  return {
    transactions,
    ignoredRows,
    errors,
    stats: {
      totalRows: rows.length,
      parsedRows: activeRows.length,
      ignoredRows: ignoredRows.length,
      errorRows: errors.length,
      transactionCount: transactions.length,
    },
  };
}

// ── Interpretación de grupos ───────────────────────────────────────────────
function interpretGroup(
  group: RawCsvRow[]
): ParsedTransaction | ParsedTransaction[] | null {
  const ops = group.map((r) => r.operation);
  const firstOp = ops[0];
  const hashes = group.map((r) => r.rowHash);
  const timestamp = group[0].time;
  const account = group[0].account;

  if (firstOp === 'Deposit') {
    const row = group[0];
    // Fiat → DEPOSIT_FIAT (ignorado en FIFO, tracking contable de entrada de efectivo)
    // Cripto → abre lote al precio de mercado. Puede ser auto-transferencia desde otra
    // wallet (coste real desconocido) o ingreso externo. Se marca para revisión.
    const isFiat = FIAT_ASSETS.has(row.coin.toUpperCase());
    return {
      operationType: isFiat ? 'DEPOSIT_FIAT' : 'AIRDROP',
      timestamp,
      asset: row.coin,
      amount: abs(row.change),
      amountNet: abs(row.change),
      account,
      notes: isFiat ? undefined : 'Depósito de cripto externo — coste de adquisición original desconocido. Verificar y ajustar si es necesario.',
      subTradeCount: 1,
      rawRowHashes: hashes,
      needsCostReview: !isFiat,
    };
  }

  if (firstOp === 'Fiat Withdraw') {
    // Retiro de EUR/fiat al banco. No hay lote FIFO que mover.
    // Se registra como WITHDRAW_FIAT para tracking contable (cuánto ha salido al banco).
    const row = group[0];
    return {
      operationType: 'WITHDRAW_FIAT',
      timestamp,
      asset: row.coin,
      amount: abs(row.change),
      amountNet: abs(row.change),
      account,
      subTradeCount: 1,
      rawRowHashes: hashes,
    };
  }

  if (firstOp === 'Withdraw') {
    return group.map((row) => ({
      operationType: 'WITHDRAW' as const,
      timestamp,
      asset: row.coin,
      amount: abs(row.change),
      amountNet: abs(row.change),
      account,
      subTradeCount: 1,
      rawRowHashes: [row.rowHash],
    }));
  }

  if (ops.every((o) => o === 'Binance Convert')) {
    return interpretConvert(group, hashes, timestamp, account);
  }

  if (ops.includes('Transaction Sold') || ops.includes('Transaction Revenue')) {
    return interpretSoldRevenue(group, hashes, timestamp, account);
  }

  // Grupo de Transaction Fee sin compra/venta asociada.
  // Ocurre con fees de margen, ajustes o fees de liquidaciones registradas aparte.
  // Cada fila es una fee independiente → FEE_EXCHANGE.
  if (group.every((r) => r.operation === 'Transaction Fee')) {
    return group.map((row) => ({
      operationType: 'FEE_EXCHANGE' as const,
      timestamp:     row.time,
      asset:         row.coin,
      amount:        abs(row.change),
      amountNet:     abs(row.change),
      account:       row.account,
      notes:         'Standalone Transaction Fee',
      subTradeCount: 1,
      rawRowHashes:  [row.rowHash],
    }));
  }

  if (ops.some(o => FIAT_BUY_OPS.has(o))) {
    return interpretBuyCryptoWithFiat(group, hashes, timestamp, account);
  }

  if (firstOp === 'BNB Fee Deduction') {
    // BNB Fee Deduction negativo: fee standalone en BNB → FEE_EXCHANGE (evento imponible)
    // BNB Fee Deduction positivo (en Isolated Margin): devolución de la fee original
    //   pagada en FTT/USDT que Binance reemplazó con BNB. → CASHBACK (pequeño ingreso)
    return group.map((row) => ({
      operationType: row.change < 0 ? 'FEE_EXCHANGE' as const : 'CASHBACK' as const,
      timestamp:     row.time,
      asset:         row.coin,
      amount:        abs(row.change),
      amountNet:     abs(row.change),
      account:       row.account,
      notes:         row.change < 0
        ? 'BNB Fee Deduction — fee en BNB (evento imponible)'
        : 'BNB Fee Deduction — devolución de fee original (rebate)',
      subTradeCount: 1,
      rawRowHashes:  [row.rowHash],
    }));
  }

  if (firstOp === 'Margin Fee' || firstOp === 'Isolated Margin Liquidation - Fee') {
    // Interés/fee de margen pagado en cripto.
    // España: disposición patrimonial al precio de mercado → evento imponible.
    const row = group[0];
    return {
      operationType: 'FEE_EXCHANGE',
      timestamp,
      asset:    row.coin,
      amount:   abs(row.change),
      amountNet:abs(row.change),
      account,
      notes:    firstOp,
      subTradeCount: 1,
      rawRowHashes: hashes,
    };
  }

  if (firstOp === 'Isolated Margin Loan') {
    return group.map((row) => ({
      operationType: 'IGNORED' as const,
      timestamp:     row.time,
      asset:         row.coin,
      amount:        abs(row.change),
      amountNet:     abs(row.change),
      account:       row.account,
      notes:         'Isolated Margin Loan — préstamo recibido (no hecho imponible)',
      subTradeCount: 1,
      rawRowHashes:  [row.rowHash],
    }));
  }

  if (firstOp === 'Isolated Margin Repayment') {
    const row = group[0];
    return {
      operationType: 'FEE_EXCHANGE',
      timestamp,
      asset:    row.coin,
      amount:   abs(row.change),
      amountNet:abs(row.change),
      account,
      notes:    'Isolated Margin Repayment — devolución de préstamo (disposición si hay lote)',
      subTradeCount: 1,
      rawRowHashes: hashes,
    };
  }

  if (ops.every((o) => o === 'Small Assets Exchange BNB')) {
    return interpretSmallAssetsExchange(group, hashes, timestamp, account);
  }

  if (ops.some((o) => o === 'Transaction Buy')) {
    return interpretTransactionBuy(group, hashes, timestamp, account);
  }

  if (ops.some((o) => o === 'Transaction Sell')) {
    return interpretTransactionSell(group, hashes, timestamp, account);
  }

  // ── Liquidaciones de margen ────────────────────────────────────────────────

  if (firstOp === 'Margin Loan') {
    // Préstamo recibido de Binance — no es ingreso ni hecho imponible.
    // Sin lote FIFO (no se ha adquirido el activo, hay obligación de devolver).
    // Se almacena en la DB como IGNORED para tracking contable.
    return group.map((row) => ({
      operationType: 'IGNORED' as const,
      timestamp:     row.time,
      asset:         row.coin,
      amount:        abs(row.change),
      amountNet:     abs(row.change),
      account:       row.account,
      notes:         'Margin Loan — préstamo recibido (no hecho imponible)',
      subTradeCount: 1,
      rawRowHashes:  [row.rowHash],
    }));
  }

  if (firstOp === 'Margin Repayment') {
    // Devolución del préstamo de margen.
    // España: si se devuelve el mismo activo prestado → no hay lote FIFO → G/P = 0.
    // Si se devuelve con un activo propio (SOL, LUNC...) → consumeLots lo calcula.
    // FEE_EXCHANGE cubre ambos casos correctamente sin código adicional.
    const row = group[0];
    return {
      operationType: 'FEE_EXCHANGE',
      timestamp,
      asset:        row.coin,
      amount:       abs(row.change),
      amountNet:    abs(row.change),
      account,
      notes:        'Margin Repayment — devolución de préstamo (disposición patrimonial si hay lote)',
      subTradeCount: 1,
      rawRowHashes: hashes,
    };
  }

  if (firstOp === 'Cross Margin Liquidation - Small Assets Takeover') {
    // Venta forzosa de colateral para cubrir la deuda.
    // La fila negativa es el activo vendido; la positiva son los proceeds recibidos.
    // Tratamiento España: transmisión patrimonial imponible (igual que una venta normal).
    const soldRow     = group.find((r) => r.change < 0);
    const proceedsRow = group.find((r) => r.change > 0);

    if (!soldRow || !proceedsRow) {
      throw new Error(`Cross Margin Liquidation - Small Assets Takeover incompleto en ${timestamp.toISOString()}`);
    }

    return {
      operationType: 'SELL',
      timestamp,
      asset:        soldRow.coin,
      amount:       abs(soldRow.change),
      amountNet:    abs(soldRow.change),
      costAsset:    proceedsRow.coin,
      costAmount:   abs(proceedsRow.change),
      pricePerUnit: abs(soldRow.change) > 0 ? abs(proceedsRow.change) / abs(soldRow.change) : 0,
      account,
      notes:        'Liquidación forzosa de margen — venta forzosa de colateral',
      subTradeCount: 1,
      rawRowHashes: hashes,
    };
  }

  if (firstOp === 'Cross Margin Liquidation - Repayment') {
    // Uso de activos para saldar la deuda con Binance.
    // España: disposición patrimonial al precio de mercado del día.
    // Si el activo era prestado (sin lote FIFO), consumeLots no actúa → G/P = 0 (correcto).
    // Si era propio (tiene lote), consume al precio de mercado → G/P real (correcto).
    const row = group[0];
    return {
      operationType: 'FEE_EXCHANGE',
      timestamp,
      asset:        row.coin,
      amount:       abs(row.change),
      amountNet:    abs(row.change),
      account,
      notes:        'Repago de préstamo de margen — disposición al precio de mercado',
      subTradeCount: 1,
      rawRowHashes: hashes,
    };
  }

  // Transferencias internas entre sub-cuentas de Binance
  // La fila con change < 0 es la salida → TRANSFER_INTERNAL (el FIFO mueve el lote)
  // La fila con change > 0 es la entrada → IGNORED (el FIFO abre el lote destino automáticamente)
  if (INTERNAL_TRANSFER_OPS.has(firstOp)) {
    return group.map((row) => ({
      operationType: row.change < 0 ? 'TRANSFER_INTERNAL' as const : 'IGNORED' as const,
      timestamp:     row.time,
      asset:         row.coin,
      amount:        abs(row.change),
      amountNet:     abs(row.change),
      account:       row.account,
      notes:         firstOp,  // preservamos la etiqueta para mapear destino en el importer
      subTradeCount: 1,
      rawRowHashes:  [row.rowHash],
    }));
  }

  // Operaciones de income (staking, lending, airdrop, cashback)
  if (INCOME_OPS[firstOp]) {
    const opType = INCOME_OPS[firstOp];
    const results: ParsedTransaction[] = [];

    for (const row of group) {
      if (row.change > 0) {
        // Ingreso normal — abre lote al precio de mercado
        results.push({
          operationType: opType,
          timestamp:     row.time,
          asset:         row.coin,
          amount:        abs(row.change),
          amountNet:     abs(row.change),
          account:       row.account,
          notes:         firstOp,
          subTradeCount: 1,
          rawRowHashes:  [row.rowHash],
        });
      } else if (firstOp === 'Asset Recovery') {
        // Asset Recovery negativo: Binance reclamó el activo.
        // Se registra como LOST para cerrar el lote FIFO a 0 proceeds.
        results.push({
          operationType: 'LOST' as const,
          timestamp:     row.time,
          asset:         row.coin,
          amount:        abs(row.change),
          amountNet:     abs(row.change),
          account:       row.account,
          notes:         'Asset Recovery — activo reclamado por Binance',
          subTradeCount: 1,
          rawRowHashes:  [row.rowHash],
        });
      }
      // Otras income ops con change negativo → ignorar (ajustes contables Binance)
    }

    return results.length > 0 ? results : null;
  }

  // Transferencias internas y suscripciones → ignoradas
  if (group.every((r) => IGNORED_OPERATIONS.has(r.operation))) {
    return group.map((row) => ({
      operationType: 'IGNORED' as const,
      timestamp:     row.time,
      asset:         row.coin,
      amount:        abs(row.change),
      amountNet:     abs(row.change),
      account:       row.account,
      notes:         row.operation,
      subTradeCount: 1,
      rawRowHashes:  [row.rowHash],
    }));
  }

  throw new Error(
    `Grupo no reconocido: ops=[${[...new Set(ops)].join(', ')}] ` +
    `coin=${group.map((r) => r.coin).join(',')} ts=${timestamp.toISOString()}`
  );
}

function interpretConvert(
  group: RawCsvRow[], hashes: string[], timestamp: Date, account: string
): ParsedTransaction {
  const inRow  = group.find((r) => r.change > 0);
  const outRow = group.find((r) => r.change < 0);

  if (!inRow || !outRow) {
    throw new Error(`Binance Convert incompleto en ${timestamp.toISOString()}`);
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
    notes: `Binance Convert: ${outRow.coin}→${inRow.coin}`,
    subTradeCount: 1,
    rawRowHashes: hashes,
  };
}

function interpretSoldRevenue(
  group: RawCsvRow[], hashes: string[], timestamp: Date, account: string
): ParsedTransaction {
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

  // Sumar fees por activo
  const feeByAsset = new Map<string, number>();
  for (const row of feeRows) {
    feeByAsset.set(row.coin, (feeByAsset.get(row.coin) ?? 0) + abs(row.change));
  }
  const feeAsset  = feeRows[0]?.coin;
  const feeAmount = feeAsset ? feeByAsset.get(feeAsset) : undefined;

  return {
    operationType: 'SELL',
    timestamp,
    asset:        soldAsset,
    amount:       totalSold,
    amountNet:    totalSold,
    costAsset:    revenueAsset,
    costAmount:   totalRevenue,
    pricePerUnit: totalSold > 0 ? totalRevenue / totalSold : 0,
    feeAsset,
    feeAmount,
    account,
    notes: soldRows.length > 1 ? `${soldRows.length} fills parciales` : undefined,
    subTradeCount: soldRows.length,
    rawRowHashes: hashes,
  };
}

function interpretBuyCryptoWithFiat(
  group: RawCsvRow[], hashes: string[], timestamp: Date, account: string
): ParsedTransaction {
  // La fila negativa es lo que se pagó (EUR u otro fiat)
  // La fila positiva es lo que se recibió (cripto)
  const paidRow     = group.find((r) => r.change < 0);
  const receivedRow = group.find((r) => r.change > 0);

  if (!paidRow || !receivedRow) {
    // Fila huérfana: solo hay la cripto recibida sin contrapartida de pago.
    // Puede ocurrir cuando el export no incluye el período del pago EUR.
    // Se abre lote al precio de mercado del día como mejor estimación.
    const row = group.find((r) => r.change > 0) ?? group[0];
    return {
      operationType: 'AIRDROP',
      timestamp,
      asset: row.coin,
      amount: abs(row.change),
      amountNet: abs(row.change),
      account,
      notes: `${row.operation} — contrapartida EUR no disponible en este export (verificar coste manualmente)`,
      subTradeCount: 1,
      rawRowHashes: hashes,
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
    notes: paidRow.remark ? `${getOperationLabel(group)} vía ${paidRow.remark}` : undefined,
    subTradeCount: 1,
    rawRowHashes: hashes,
  };
}

function getOperationLabel(group: RawCsvRow[]): string {
  return group[0]?.operation ?? '';
}

function interpretSmallAssetsExchange(
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

function interpretTransactionBuy(
  group: RawCsvRow[], hashes: string[], timestamp: Date, account: string
): ParsedTransaction | ParsedTransaction[] {
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
    const feeAsset    = feeRows[0]?.coin;
    const totalFee    = feeRows.reduce((s, r) => s + abs(r.change), 0);

    return {
      operationType: 'SELL',
      timestamp,
      asset:        soldAsset,
      amount:       totalSold,
      amountNet:    totalSold,
      costAsset:    spendAssets[0],
      costAmount:   totalProc,
      pricePerUnit: totalSold > 0 ? totalProc / totalSold : 0,
      feeAsset:     feeAsset,
      feeAmount:    totalFee > 0 ? totalFee : undefined,
      account,
      notes:        'Venta en margen (Transaction Buy con signo negativo)',
      subTradeCount: buyRows.length,
      rawRowHashes: hashes,
    };
  }

  if (buyAssets.length > 1) {
    return interpretMultiAssetBuy(group, timestamp, account);
  }

  const asset     = buyAssets[0];
  const costAsset = spendAssets[0] ?? 'EUR';

  const totalBought = buyRows.reduce((s, r) => s + abs(r.change), 0);
  const totalSpent  = spendRows.reduce((s, r) => s + abs(r.change), 0);

  const feesInSameAsset = feeRows.filter((r) => r.coin === asset);
  const feesInOther     = feeRows.filter((r) => r.coin !== asset);

  const feeInAssetTotal = feesInSameAsset.reduce((s, r) => s + abs(r.change), 0);
  const feeInOtherTotal = feesInOther.reduce((s, r) => s + abs(r.change), 0);
  const feeOtherAsset   = feesInOther[0]?.coin;

  const amountNet    = totalBought - feeInAssetTotal;
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
    // Si hay fees en el mismo activo Y en otro activo (ej: BAKE + BNB),
    // el BUY solo registra la fee del mismo activo. La fee del otro activo
    // se devuelve como FEE_EXCHANGE separado para que el FIFO la consuma.
    feeAsset:  feeInAssetTotal > 0 ? asset : feeOtherAsset,
    feeAmount: feeInAssetTotal > 0 ? feeInAssetTotal : (feeInOtherTotal > 0 ? feeInOtherTotal : undefined),
    account,
    subTradeCount: buyRows.length,
    rawRowHashes: hashes,
  };

  // Fees en activo distinto al comprado (ej: BNB) cuando TAMBIÉN hay fees en el mismo activo.
  // En este caso la fee BNB no cabe en el BUY → FEE_EXCHANGE independiente.
  if (feeInAssetTotal > 0 && feeInOtherTotal > 0 && feeOtherAsset) {
    const feeTx: ParsedTransaction = {
      operationType: 'FEE_EXCHANGE',
      timestamp,
      asset:    feeOtherAsset,
      amount:   feeInOtherTotal,
      amountNet: feeInOtherTotal,
      account,
      notes: `Fee en ${feeOtherAsset} para BUY ${asset}`,
      subTradeCount: feesInOther.length,
      rawRowHashes: feesInOther.map(r => r.rowHash),
    };
    return [buyTx, feeTx];
  }

  return buyTx;
}

function interpretMultiAssetBuy(
  group: RawCsvRow[], timestamp: Date, account: string
): ParsedTransaction[] {
  const buyRows   = group.filter((r) => r.operation === 'Transaction Buy');
  const spendRows = group.filter((r) => r.operation === 'Transaction Spend');
  const feeRows   = group.filter((r) => r.operation === 'Transaction Fee');

  const byAsset = new Map<string, RawCsvRow[]>();
  for (const row of buyRows) {
    if (!byAsset.has(row.coin)) byAsset.set(row.coin, []);
    byAsset.get(row.coin)!.push(row);
  }

  const totalSpent       = spendRows.reduce((s, r) => s + abs(r.change), 0);
  const totalBoughtValue = buyRows.reduce((s, r) => s + abs(r.change), 0);
  const costAsset        = spendRows[0]?.coin ?? 'USDC';
  const feeOtherRows     = feeRows.filter((r) => !byAsset.has(r.coin));

  return [...byAsset.entries()].map(([asset, rows]) => {
    const assetTotal       = rows.reduce((s, r) => s + abs(r.change), 0);
    const proportion       = assetTotal / totalBoughtValue;
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

function interpretTransactionSell(
  group: RawCsvRow[], hashes: string[], timestamp: Date, account: string
): ParsedTransaction {
  const sellRow    = group.find((r) => r.operation === 'Transaction Sell' && r.change < 0);
  const receiveRow = group.find((r) => r.change > 0 && r.operation !== 'Transaction Fee');
  const feeRow     = group.find((r) => r.operation === 'Transaction Fee');

  if (!sellRow) {
    throw new Error(`Transaction Sell sin fila de venta en ${timestamp.toISOString()}`);
  }

  return {
    operationType: 'SELL',
    timestamp,
    asset: sellRow.coin,
    amount: abs(sellRow.change),
    amountNet: abs(sellRow.change),
    costAsset:  receiveRow?.coin,
    costAmount: receiveRow ? abs(receiveRow.change) : undefined,
    feeAsset:  feeRow?.coin,
    feeAmount: feeRow ? abs(feeRow.change) : undefined,

    account,
    subTradeCount: 1,
    rawRowHashes: hashes,
  };
}
