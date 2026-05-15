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

const IGNORED_OPERATIONS = new Set([
  'Transfer Between Main and Funding Wallet',
  'Asset Recovery',
]);

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

      if (Math.abs(ts - groupTs) <= 1500 && sameMainOp && sameAccount) {
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
  if (operation.startsWith('Transaction')) return 'Transaction';
  if (operation === 'Binance Convert') return 'BinanceConvert';
  if (operation === 'Buy Crypto With Fiat') return 'BuyCryptoFiat';
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

  // 4. Separar ignoradas
  const activeRows: RawCsvRow[] = [];
  for (const row of rows) {
    if (IGNORED_OPERATIONS.has(row.operation) || row.operation === 'Asset Recovery') {
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
    return {
      operationType: 'DEPOSIT_FIAT',
      timestamp,
      asset: row.coin,
      amount: abs(row.change),
      amountNet: abs(row.change),
      wallet: 'BINANCE',
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
      wallet: 'BINANCE' as const,
      account,
      notes: 'Withdraw fee is included — destino: Tangem',
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

  if (ops.includes('Buy Crypto With Fiat')) {
    return interpretBuyCryptoWithFiat(group, hashes, timestamp, account);
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
    wallet: 'BINANCE',
    account,
    notes: `Binance Convert: ${outRow.coin}→${inRow.coin}`,
    subTradeCount: 1,
    rawRowHashes: hashes,
  };
}

function interpretSoldRevenue(
  group: RawCsvRow[], hashes: string[], timestamp: Date, account: string
): ParsedTransaction {
  const soldRow    = group.find((r) => r.operation === 'Transaction Sold');
  const revenueRow = group.find((r) => r.operation === 'Transaction Revenue');
  const feeRow     = group.find((r) => r.operation === 'Transaction Fee');

  if (!soldRow || !revenueRow) {
    throw new Error(`Transaction Sold/Revenue incompleto en ${timestamp.toISOString()}`);
  }

  const amountIn  = abs(revenueRow.change);
  const amountOut = abs(soldRow.change);

  return {
    operationType: 'BUY',
    timestamp,
    asset: revenueRow.coin,
    amount: amountIn,
    amountNet: amountIn,
    costAsset: soldRow.coin,
    costAmount: amountOut,
    pricePerUnit: amountOut / amountIn,
    feeAsset:  feeRow?.coin,
    feeAmount: feeRow ? abs(feeRow.change) : undefined,
    wallet: 'BINANCE',
    account,
    notes: `Transaction Sold/Revenue: ${soldRow.coin}→${revenueRow.coin}`,
    subTradeCount: 1,
    rawRowHashes: hashes,
  };
}

function interpretBuyCryptoWithFiat(
  group: RawCsvRow[], hashes: string[], timestamp: Date, account: string
): ParsedTransaction {
  const eurRow    = group.find((r) => r.coin === 'EUR' && r.change < 0);
  const cryptoRow = group.find((r) => r.coin !== 'EUR' && r.change > 0);

  if (!eurRow || !cryptoRow) {
    throw new Error(`Buy Crypto With Fiat incompleto en ${timestamp.toISOString()}`);
  }

  return {
    operationType: 'BUY',
    timestamp: cryptoRow.time,
    asset: cryptoRow.coin,
    amount: abs(cryptoRow.change),
    amountNet: abs(cryptoRow.change),
    costAsset: 'EUR',
    costAmount: abs(eurRow.change),
    pricePerUnit: abs(eurRow.change) / abs(cryptoRow.change),
    wallet: 'BINANCE',
    account,
    notes: `Buy Crypto With Fiat vía ${eurRow.remark}`,
    subTradeCount: 1,
    rawRowHashes: hashes,
  };
}

function interpretSmallAssetsExchange(
  group: RawCsvRow[], hashes: string[], timestamp: Date, account: string
): ParsedTransaction {
  const inRow  = group.find((r) => r.change > 0);
  const outRow = group.find((r) => r.change < 0);

  if (!inRow || !outRow) {
    throw new Error(`Small Assets Exchange incompleto en ${timestamp.toISOString()}`);
  }

  return {
    operationType: 'BUY',
    timestamp,
    asset: inRow.coin,
    amount: abs(inRow.change),
    amountNet: abs(inRow.change),
    costAsset: outRow.coin,
    costAmount: abs(outRow.change),
    pricePerUnit: abs(outRow.change) / abs(inRow.change),
    wallet: 'BINANCE',
    account,
    notes: `Small Assets Exchange: ${outRow.coin}→${inRow.coin} (dust)`,
    subTradeCount: 1,
    rawRowHashes: hashes,
  };
}

function interpretTransactionBuy(
  group: RawCsvRow[], hashes: string[], timestamp: Date, account: string
): ParsedTransaction | ParsedTransaction[] {
  const buyRows   = group.filter((r) => r.operation === 'Transaction Buy');
  const spendRows = group.filter((r) => r.operation === 'Transaction Spend');
  const feeRows   = group.filter((r) => r.operation === 'Transaction Fee');

  const buyAssets   = [...new Set(buyRows.map((r) => r.coin))];
  const spendAssets = [...new Set(spendRows.map((r) => r.coin))];

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

  return {
    operationType: 'BUY',
    timestamp,
    asset,
    amount: totalBought,
    amountNet,
    costAsset,
    costAmount: totalSpent,
    pricePerUnit,
    feeAsset:  feeInAssetTotal > 0 ? asset : feeOtherAsset,
    feeAmount: feeInAssetTotal > 0 ? feeInAssetTotal : (feeInOtherTotal > 0 ? feeInOtherTotal : undefined),
    wallet: 'BINANCE',
    account,
    subTradeCount: buyRows.length,
    rawRowHashes: hashes,
  };
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
      wallet: 'BINANCE' as const,
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
    wallet: 'BINANCE',
    account,
    subTradeCount: 1,
    rawRowHashes: hashes,
  };
}
