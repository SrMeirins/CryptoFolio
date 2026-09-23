import { createHash } from 'crypto';
import { parse } from 'csv-parse/sync';
import { ParsedTransaction, CsvParseResult, ParseError } from './types';

// Activos fiat conocidos — depósitos/retiros de estos no llevan lote FIFO
const FIAT_ASSETS = new Set(['EUR', 'USD', 'GBP', 'CHF']);

// Tipos de operación de Bitvavo reconocidos por este parser.
// Cualquier Type fuera de este set aborta el import con un error explícito
// en vez de ignorarse en silencio — mismo principio que ALL_IGNORED_OPERATIONS
// en el parser de Binance: fallar alto es mejor que perder transacciones.
const KNOWN_TYPES = new Set(['buy', 'deposit', 'withdrawal', 'rebate']);

interface BitvavoRow {
  timezone: string;
  date: string;
  time: string;
  type: string;
  currency: string;
  amount: number;
  quoteCurrency: string;
  quotePrice: number | null;
  receivedPaidCurrency: string;
  receivedPaidAmount: number | null;
  feeCurrency: string;
  feeAmount: number | null;
  status: string;
  transactionId: string;
  rowHash: string;
}

// Convierte fecha+hora local (con IANA timezone explícito del CSV) a UTC real,
// respetando el cambio de horario (CET/CEST) de la fecha concreta — a diferencia
// de Binance, que ya exporta en UTC. No usa una librería nueva: Node trae ICU
// completo de serie y Intl.DateTimeFormat resuelve el offset correcto para
// cualquier fecha/timezone IANA sin tablas de offsets hardcodeadas.
function toUtcDate(dateStr: string, timeStr: string, timezone: string): Date {
  const [hms, msRaw] = timeStr.split('.');
  const naiveIso = `${dateStr}T${hms}`;
  const asIfUtc = new Date(naiveIso + 'Z');
  if (isNaN(asIfUtc.getTime())) {
    throw new Error(`Fecha/hora inválida: ${dateStr} ${timeStr}`);
  }

  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  });
  const parts: Record<string, string> = {};
  for (const p of fmt.formatToParts(asIfUtc)) parts[p.type] = p.value;
  const hour = parts.hour === '24' ? '00' : parts.hour;
  const localReading = new Date(`${parts.year}-${parts.month}-${parts.day}T${hour}:${parts.minute}:${parts.second}Z`);

  const offsetMs = asIfUtc.getTime() - localReading.getTime();
  const realUtc = new Date(asIfUtc.getTime() + offsetMs);

  if (msRaw) realUtc.setUTCMilliseconds(parseInt(msRaw.padEnd(3, '0').slice(0, 3), 10));
  return realUtc;
}

function parseNum(raw: string | undefined): number | null {
  if (raw === undefined || raw === null || raw.trim() === '') return null;
  const n = parseFloat(raw);
  return isNaN(n) ? null : n;
}

function abs(n: number): number {
  return Math.abs(n);
}

export function parseBitvavoCsv(fileContent: Buffer | string): CsvParseResult {
  const errors: ParseError[] = [];
  const ignoredRows: BitvavoRow[] = [];

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

  const rows: BitvavoRow[] = [];
  for (const record of rawRecords) {
    try {
      const key = [
        record['Transaction ID'] ?? '',
        record['Date'] ?? '', record['Time'] ?? '', record['Type'] ?? '',
        record['Currency'] ?? '', record['Amount'] ?? '',
      ].join('|');
      rows.push({
        timezone:             record['Timezone'] ?? 'UTC',
        date:                 record['Date'] ?? '',
        time:                 record['Time'] ?? '',
        type:                 (record['Type'] ?? '').trim().toLowerCase(),
        currency:             (record['Currency'] ?? '').trim().toUpperCase(),
        amount:               parseNum(record['Amount']) ?? 0,
        quoteCurrency:        (record['Quote Currency'] ?? '').trim().toUpperCase(),
        quotePrice:           parseNum(record['Quote Price']),
        receivedPaidCurrency: (record['Received / Paid Currency'] ?? '').trim().toUpperCase(),
        receivedPaidAmount:   parseNum(record['Received / Paid Amount']),
        feeCurrency:          (record['Fee currency'] ?? '').trim().toUpperCase(),
        feeAmount:            parseNum(record['Fee amount']),
        status:               record['Status'] ?? '',
        transactionId:        record['Transaction ID'] ?? '',
        rowHash: createHash('sha256').update(key).digest('hex'),
      });
    } catch (e) {
      errors.push({ rows: [], message: `Error parseando fila Bitvavo: ${JSON.stringify(record)} — ${(e as Error).message}` });
    }
  }

  const transactions: ParsedTransaction[] = [];
  const unrecognizedTypes = new Set<string>();

  for (const row of rows) {
    if (row.status !== 'Completed') {
      ignoredRows.push(row);
      continue;
    }

    let timestamp: Date;
    try {
      timestamp = toUtcDate(row.date, row.time, row.timezone);
    } catch (e) {
      errors.push({ rows: [], message: `${(e as Error).message} (tx ${row.transactionId})` });
      continue;
    }

    if (!KNOWN_TYPES.has(row.type)) {
      unrecognizedTypes.add(row.type);
      continue;
    }

    if (row.type === 'buy') {
      const costAsset = row.receivedPaidCurrency || row.quoteCurrency;
      const costAmount = row.receivedPaidAmount != null ? abs(row.receivedPaidAmount) : null;
      // El fee de Bitvavo en compras va en la misma moneda de cotización (EUR) y
      // ya viene INCLUIDO en "Received / Paid Amount" (verificado numéricamente:
      // Quote Price × Amount + Fee = Received/Paid Amount). Si algún día Bitvavo
      // cobra el fee en un activo distinto al de cotización, sí lo registramos
      // aparte para que el motor FIFO lo trate como una disposición.
      const feeAlreadyIncluded = row.feeCurrency === costAsset;
      transactions.push({
        operationType: 'BUY',
        timestamp,
        asset: row.currency,
        amount: abs(row.amount),
        amountNet: abs(row.amount),
        costAsset: costAsset || undefined,
        costAmount: costAmount ?? undefined,
        pricePerUnit: row.quotePrice ?? undefined,
        feeAsset: feeAlreadyIncluded ? undefined : (row.feeCurrency || undefined),
        feeAmount: feeAlreadyIncluded ? undefined : (row.feeAmount ?? undefined),
        account: 'Bitvavo',
        notes: 'Bitvavo buy',
        subTradeCount: 1,
        rawRowHashes: [row.rowHash],
      });
      continue;
    }

    if (row.type === 'deposit') {
      const isFiat = FIAT_ASSETS.has(row.currency);
      transactions.push({
        operationType: isFiat ? 'DEPOSIT_FIAT' : 'DEPOSIT_CRYPTO',
        timestamp,
        asset: row.currency,
        amount: abs(row.amount),
        amountNet: abs(row.amount),
        account: 'Bitvavo',
        notes: isFiat ? undefined : 'Depósito de cripto externo — coste de adquisición original desconocido. Verificar y ajustar si es necesario.',
        subTradeCount: 1,
        rawRowHashes: [row.rowHash],
        needsCostReview: !isFiat,
      });
      continue;
    }

    if (row.type === 'withdrawal') {
      const isFiat = FIAT_ASSETS.has(row.currency);
      if (isFiat) {
        transactions.push({
          operationType: 'WITHDRAW_FIAT',
          timestamp,
          asset: row.currency,
          amount: abs(row.amount),
          amountNet: abs(row.amount),
          account: 'Bitvavo',
          subTradeCount: 1,
          rawRowHashes: [row.rowHash],
        });
        continue;
      }
      // Fee de red en el mismo activo retirado: va INCLUIDO en Amount (verificado:
      // Amount coincide exactamente con la cantidad comprada, y Fee es una porción
      // de ese Amount) — el neto que llega a la wallet destino es Amount - Fee.
      // Se registra feeAsset/feeAmount para que el motor FIFO trate esa porción
      // como una disposición patrimonial (evento fiscal) antes de mover el resto.
      const feeInSameAsset = row.feeCurrency === row.currency && row.feeAmount;
      const grossAmount = abs(row.amount);
      const feeAmt = feeInSameAsset ? (row.feeAmount as number) : 0;
      transactions.push({
        operationType: 'WITHDRAW',
        timestamp,
        asset: row.currency,
        amount: grossAmount - feeAmt,
        amountNet: grossAmount - feeAmt,
        feeAsset: feeInSameAsset ? row.currency : undefined,
        feeAmount: feeInSameAsset ? feeAmt : undefined,
        account: 'Bitvavo',
        subTradeCount: 1,
        rawRowHashes: [row.rowHash],
      });
      continue;
    }

    if (row.type === 'rebate') {
      // Bitvavo no documenta "rebate" con detalle — por los importes coincide con
      // devoluciones de comisión de trading de promociones puntuales. Se registra
      // como CASHBACK para que sume al saldo (no se pierda del tracking) dejando
      // constancia de la incertidumbre en notes para revisión fiscal manual.
      transactions.push({
        operationType: 'CASHBACK',
        timestamp,
        asset: row.currency,
        amount: abs(row.amount),
        amountNet: abs(row.amount),
        account: 'Bitvavo',
        notes: 'Bitvavo rebate — probable devolución de comisión de trading (verificar tratamiento fiscal)',
        subTradeCount: 1,
        rawRowHashes: [row.rowHash],
      });
      continue;
    }
  }

  if (unrecognizedTypes.size > 0) {
    errors.push({
      rows: [],
      message: `Tipo(s) de operación Bitvavo no reconocido(s): ${[...unrecognizedTypes].join(', ')}. ` +
        `Bitvavo puede haber añadido un tipo nuevo — verifica manualmente antes de continuar.`,
    });
  }

  return {
    transactions,
    ignoredRows: [],
    errors,
    stats: {
      totalRows: rows.length,
      parsedRows: transactions.length,
      ignoredRows: ignoredRows.length,
      errorRows: errors.length,
      transactionCount: transactions.length,
    },
  };
}
