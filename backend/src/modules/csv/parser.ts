import { createHash } from 'crypto';
import { parse } from 'csv-parse/sync';
import {
  RawCsvRow,
  RawRowWithHash,
  ParsedTransaction,
  CsvParseResult,
  ParseError,
} from './types';
import { preprocess } from './preprocessor';
import { detectLanguage, normalizeHeaders } from './languages';
import { ALL_IGNORED_OPERATIONS } from './binanceAccounts';
import { abs, FIAT_ASSETS, FIAT_BUY_OPS, normalizeBinanceYear } from './csvUtils';
import { tryInterpretLockUnlock } from './interpreters/lockUnlock';
import {
  interpretConvert,
  interpretEthStaking,
  interpretEthStakingWithdrawals,
  interpretSoldRevenue,
  interpretBuyCryptoWithFiat,
  interpretSmallAssetsExchange,
  interpretTransactionBuy,
  interpretTransactionSell,
  interpretTransactionRelated,
} from './interpreters/trades';
import {
  INTERNAL_TRANSFER_OPS,
  interpretDeposit,
  interpretFiatWithdraw,
  interpretWithdraw,
  interpretInternalTransfer,
} from './interpreters/transfers';
import {
  INCOME_OPS,
  interpretStandaloneFee,
  interpretBnbFeeDeduction,
  interpretMarginFee,
  interpretMarginBorrow,
  interpretMarginRepay,
  interpretCrossMarginLiquidationTakeover,
  interpretStrategyFeeRebate,
  interpretIncomeOp,
} from './interpreters/marginAndFees';

// Importado desde binanceAccounts.ts — fuente de verdad única
const IGNORED_OPERATIONS = ALL_IGNORED_OPERATIONS;

function parseDate(raw: string): Date {
  const trimmed = raw.trim();
  const normalized = normalizeBinanceYear(trimmed);
  const d = new Date(normalized.replace(' ', 'T') + 'Z');
  if (isNaN(d.getTime())) throw new Error(`Fecha inválida: ${raw}`);
  return d;
}

// occurrenceIndex: cuántas veces ha aparecido esta misma tupla ANTES en el
// CSV (en orden de lectura). Binance no da más resolución que el segundo ni
// un ID de orden en el export estándar — dos operaciones REALMENTE distintas
// con los mismos valores en el mismo segundo (confirmado en datos reales del
// usuario) colisionarían sin esto. Es estable entre reimports del mismo
// archivo: el mismo CSV produce siempre el mismo orden de filas.
//
// Remark NO participa en el hash a propósito: Binance puede reformatear ese
// texto retroactivamente para operaciones históricas — si formara parte del
// hash, un reexport del mismo periodo generaría un hash distinto para la
// MISMA operación real y la duplicaría en un reimport. El índice de
// aparición ya protege contra colisiones sin necesitar el contenido de
// Remark para desambiguar.
export function rowHash(row: Record<string, string>, occurrenceIndex: number): string {
  const key = [
    row['User ID'] ?? '',
    row['Time'] ?? '',
    row['Account'] ?? '',
    row['Operation'] ?? '',
    row['Coin'] ?? '',
    row['Change'] ?? '',
    String(occurrenceIndex),
  ].join('|');
  return createHash('sha256').update(key).digest('hex');
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

// Agrupa filas por timestamp+tipo+cuenta. Para el caso general (windowMs=0,
// la inmensa mayoría de filas) es una coincidencia exacta de clave → lookup
// O(1) directo. Solo Binance Convert tolera una ventana de hasta 1500ms entre
// sus filas; para ese caso se mantiene una lista pequeña de candidatos
// recientes POR CUENTA (solo grupos de tipo BinanceConvert, no todos los
// grupos creados) en vez de escanear todos los grupos ya creados.
//
// Antes escaneaba linealmente TODOS los grupos existentes por cada fila
// nueva — O(n²). Confirmado empíricamente antes de este fix: 20.000 filas
// (un historial de varios años con varias cuentas, nada exagerado) tardaban
// 34s; 50.000 filas, 211s. Con este índice, ambos casos bajan a <1s.
function groupByTimestamp(rows: RawCsvRow[]): Map<string, RawCsvRow[]> {
  const groups = new Map<string, RawCsvRow[]>();
  const recentConvertCandidates = new Map<string, { ts: number; key: string }[]>(); // key: account

  for (const row of rows) {
    const ts = row.time.getTime();
    const op = mainOpType(row.operation);

    if (op !== 'BinanceConvert') {
      const key = `${ts}|${op}|${row.account}`;
      const existing = groups.get(key);
      if (existing) existing.push(row);
      else groups.set(key, [row]);
      continue;
    }

    // Binance Convert puede tener hasta 1500ms de diferencia entre sus filas.
    const WINDOW_MS = 1500;
    const candidates = recentConvertCandidates.get(row.account) ?? [];
    const match = candidates.find((c) => Math.abs(ts - c.ts) <= WINDOW_MS);
    if (match) {
      groups.get(match.key)!.push(row);
    } else {
      const key = `${ts}|${op}|${row.account}`;
      groups.set(key, [row]);
      candidates.push({ ts, key });
      recentConvertCandidates.set(row.account, candidates);
    }
  }

  return groups;
}

// ── Parser principal ───────────────────────────────────────────────────────
export async function parseBinanceCsv(fileContent: Buffer | string): Promise<CsvParseResult> {
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
      rawRows: [],
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
  const rawRows: RawRowWithHash[] = [];
  const tupleOccurrences = new Map<string, number>();
  for (const record of records) {
    try {
      const tupleKey = [
        record['User ID'], record['Time'], record['Account'], record['Operation'],
        record['Coin'], record['Change'],
      ].join('|');
      const occurrenceIndex = tupleOccurrences.get(tupleKey) ?? 0;
      tupleOccurrences.set(tupleKey, occurrenceIndex + 1);
      const hash = rowHash(record, occurrenceIndex);

      rows.push({
        userId:    record['User ID'] ?? '',
        time:      parseDate(record['Time']),
        account:   record['Account'] ?? '',
        operation: record['Operation'] ?? '',
        coin:      record['Coin'] ?? '',
        change:    parseFloat(record['Change'] ?? '0'),
        remark:    record['Remark'] ?? '',
        rowHash:   hash,
      });
      rawRows.push({ record, hash });
    } catch (e) {
      errors.push({
        rows: [],
        message: `Error parseando fila: ${JSON.stringify(record)} — ${(e as Error).message}`,
      });
    }
  }

  // 3b. Normalizar timestamps de Transfer (Spot→Strategy) que llegan 1-5 segundos
  //     DESPUÉS de un BUY en Strategy.
  //     Binance Strategy ejecuta el trade a T y transfiere el funding a T+1..T+5;
  //     la prioridad TRANSFER_INTERNAL (3) antes que BUY (4) solo funciona dentro
  //     del mismo timestamp. Normalizamos el Spot-TRANSFER al timestamp del BUY.
  //
  //     Criterio de matching sin order ID (el CSV no lo contiene):
  //     - Hay un BUY en Strategy a timestamp T que gasta la misma moneda (coin = costCoin)
  //     - Hay un Transfer Spot→Strategy (Spot negativo) de esa misma moneda a T+1..T+5
  //     → El Transfer se mueve a T para que TRANSFER_INTERNAL (3) corra antes que BUY (4).
  {
    const MAX_DELTA_MS = 5000;

    // Mapa: "timestamp_ms|coin" → BUY timestamp para BUYs en Strategy que gastan esa coin
    // Un BUY "gasta" el costAsset: la fila Transaction Spend indica la coin de coste.
    const strategySpendAtTime = new Map<string, Date>(); // key = "coin|buyTimeMs"
    for (const row of rows) {
      if (row.operation === 'Transaction Spend' && row.account === 'Strategy') {
        // coin es el activo que se gasta (p.ej. USDT), time es el timestamp del BUY
        const key = `${row.coin}|${row.time.getTime()}`;
        strategySpendAtTime.set(key, row.time);
      }
    }

    // Para cada Transfer Spot→Strategy (Spot, negativo), buscar BUY a T-5s..T-1ms
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (
        (row.operation === 'Transfer Between Spot and Strategy' ||
         row.operation === 'Transfer Between Spot and Strategy Account') &&
        row.account === 'Spot' &&
        row.change < 0
      ) {
        const transferTs = row.time.getTime();
        // Buscar si hay un BUY en Strategy que gastó esta misma coin en los 5s previos
        for (const [key, buyTime] of strategySpendAtTime) {
          const [spendCoin, buyTsStr] = key.split('|');
          if (spendCoin !== row.coin) continue;
          const delta = transferTs - parseInt(buyTsStr);
          if (delta > 0 && delta <= MAX_DELTA_MS) {
            rows[i] = { ...row, time: new Date(buyTime) };
            break;
          }
        }
      }
    }
  }

  // 4. Separar ignoradas de activas.
  //    Las filas en IGNORED_OPERATIONS generan ParsedTransactions de tipo IGNORED
  //    (se insertan en la BD y aparecen en historial) pero el motor FIFO las salta.
  const activeRows: RawCsvRow[] = [];
  const preIgnoredTxs: ParsedTransaction[] = [];
  for (const row of rows) {
    if (IGNORED_OPERATIONS.has(row.operation)) {
      ignoredRows.push(row);  // para stats
      preIgnoredTxs.push({
        operationType: 'IGNORED',
        timestamp:  row.time,
        asset:      row.coin,
        amount:     abs(row.change),
        amountNet:  abs(row.change),
        account:    row.account,
        notes:      row.operation,
        subTradeCount: 1,
        rawRowHashes: [row.rowHash],
      });
    } else {
      activeRows.push(row);
    }
  }

  // 5. Pre-procesar (Buy Crypto With Fiat linking)
  const preprocessedRows = preprocess(activeRows);

  // 5b. Pre-scan: claves de depósitos que financian una compra "Transaction Related"
  //     Se construyen ANTES de agrupar para que el handler de Deposit pueda ignorarlos.
  const fundingDepositKeys = buildFundingDepositKeys(preprocessedRows);

  // 6. Agrupar por timestamp
  const groups = groupByTimestamp(preprocessedRows);

  // 7. Interpretar cada grupo
  const transactions: ParsedTransaction[] = [];

  for (const [, group] of groups) {
    try {
      const parsed = await interpretGroup(group, fundingDepositKeys);
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

  // Fusionar las IGNORED pre-escaneadas (de IGNORED_OPERATIONS) con las del parser
  transactions.push(...preIgnoredTxs);
  transactions.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

  return {
    transactions,
    ignoredRows,
    errors,
    rawRows,
    stats: {
      totalRows: rows.length,
      parsedRows: activeRows.length,
      ignoredRows: ignoredRows.length,
      errorRows: errors.length,
      transactionCount: transactions.length,
    },
  };
}

// Construye el set de claves de depósitos que financian compras "Transaction Related".
// Clave: `${ts_ms}|${account}|${coin}|${amount}` → el Deposit con esa clave se ignora.
function buildFundingDepositKeys(preprocessedRows: RawCsvRow[]): Set<string> {
  const keys = new Set<string>();
  for (const row of preprocessedRows) {
    if (row.operation === 'Transaction Related' && FIAT_ASSETS.has(row.coin.toUpperCase()) && row.change < 0) {
      keys.add(`${row.time.getTime()}|${row.account}|${row.coin}|${abs(row.change)}`);
    }
  }
  return keys;
}

// ── Interpretación de grupos ───────────────────────────────────────────────
// Dispatcher: delega en los interpretadores por familia de operación
// (interpreters/transfers.ts, trades.ts, marginAndFees.ts, lockUnlock.ts).
async function interpretGroup(
  group: RawCsvRow[],
  fundingDepositKeys: Set<string>
): Promise<ParsedTransaction | ParsedTransaction[] | null> {
  const ops = group.map((r) => r.operation);
  const firstOp = ops[0];
  const hashes = group.map((r) => r.rowHash);
  const timestamp = group[0].time;
  const account = group[0].account;

  if (firstOp === 'Deposit') {
    return interpretDeposit(group, hashes, timestamp, account, fundingDepositKeys);
  }

  if (firstOp === 'Fiat Withdraw') {
    return interpretFiatWithdraw(group, hashes, timestamp, account);
  }

  if (firstOp === 'Withdraw') {
    return interpretWithdraw(group, timestamp);
  }

  if (ops.every((o) => o === 'Binance Convert')) {
    return interpretConvert(group, hashes, timestamp, account);
  }

  if (ops.includes('Transaction Sold') || ops.includes('Transaction Revenue')) {
    return interpretSoldRevenue(group, hashes, timestamp, account);
  }

  if (group.every((r) => r.operation === 'Transaction Fee')) {
    return interpretStandaloneFee(group);
  }

  if (ops.some(o => FIAT_BUY_OPS.has(o))) {
    return interpretBuyCryptoWithFiat(group, hashes, timestamp, account);
  }

  if (firstOp === 'BNB Fee Deduction') {
    return interpretBnbFeeDeduction(group);
  }

  if (firstOp === 'Margin Fee' || firstOp === 'Isolated Margin Liquidation - Fee') {
    return interpretMarginFee(group, hashes, timestamp, account, firstOp);
  }

  if (firstOp === 'Isolated Margin Loan') {
    return interpretMarginBorrow(group, firstOp, 'Isolated Margin Loan — préstamo (lote abierto a precio de mercado)');
  }

  if (firstOp === 'Isolated Margin Repayment') {
    return interpretMarginRepay(group, 'Isolated Margin Repayment — devolución de préstamo (sin impacto fiscal)');
  }

  if (ops.every((o) => o === 'Small Assets Exchange BNB')) {
    return interpretSmallAssetsExchange(group, hashes, timestamp, account);
  }

  if (ops.some((o) => o === 'Transaction Buy')) {
    return await interpretTransactionBuy(group, hashes, timestamp, account);
  }

  if (ops.some((o) => o === 'Transaction Sell')) {
    return interpretTransactionSell(group, hashes, timestamp, account);
  }

  // ── Liquidaciones de margen ────────────────────────────────────────────────

  if (firstOp === 'Margin Loan') {
    return interpretMarginBorrow(group, firstOp, 'Margin Loan — préstamo (lote abierto a precio de mercado)');
  }

  if (firstOp === 'Margin Repayment') {
    return interpretMarginRepay(group, 'Margin Repayment — devolución de préstamo (sin impacto fiscal)');
  }

  if (firstOp === 'Cross Margin Liquidation - Small Assets Takeover') {
    return interpretCrossMarginLiquidationTakeover(group, hashes, timestamp, account);
  }

  if (firstOp === 'Cross Margin Liquidation - Repayment') {
    return interpretMarginRepay(group, 'Liquidación forzosa de margen — devolución de préstamo (sin impacto fiscal)');
  }

  // Bloqueos/desbloqueos de staking, launchpool y simple-earn
  const lockUnlockResult = tryInterpretLockUnlock(firstOp, group);
  if (lockUnlockResult !== null) return lockUnlockResult;

  // ETH 2.0 Staking: ETH → BETH (1:1, mismo timestamp) — swap/convert
  if (firstOp === 'ETH 2.0 Staking') {
    return interpretEthStaking(group, hashes, timestamp, account);
  }

  // ETH 2.0 Staking Withdrawals: BETH → ETH (1:1, mismo timestamp) — swap inverso
  if (firstOp === 'ETH 2.0 Staking Withdrawals') {
    return interpretEthStakingWithdrawals(group, hashes, timestamp, account);
  }

  if (INTERNAL_TRANSFER_OPS.has(firstOp)) {
    return interpretInternalTransfer(group, firstOp);
  }

  if (firstOp === 'Strategy Trading Fee Rebate') {
    return interpretStrategyFeeRebate(group);
  }

  // Operaciones de income (staking, lending, airdrop, cashback)
  if (INCOME_OPS[firstOp]) {
    return interpretIncomeOp(group, firstOp);
  }

  // Compra EUR→cripto vía depósito directo (patrón antiguo Binance)
  // Rows: Transaction Related EUR -X + Transaction Related CRIPTO +Y (mismo remark hash)
  // El Deposit EUR +X al mismo timestamp es ignorado por fundingDepositKeys.
  if (firstOp === 'Transaction Related') {
    return interpretTransactionRelated(group, hashes, timestamp, account);
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
