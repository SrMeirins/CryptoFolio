import { parse } from 'csv-parse/sync';
import { db } from '../../db/client';
import { ValidationResult } from './validator';
import { ParsedTransaction } from './types';
import { Exchange, parseExchangeCsv, validateExchangeCsv } from './exchanges';
import { getHistoricalPriceEur } from '../prices/binance';

export interface UnknownOperationSample {
  timestamp: string;
  asset: string;
  amount: number;
  originalLabel: string;
}

export interface DepositReview {
  txKey: string;           // rawRowHashes[0] para nuevos, o UUID para ya importados
  timestamp: string;
  asset: string;
  amount: number;
  historicalPrice: number | null;
  existingInDb?: boolean;  // true si ya está importado (necesita bulk-set-costs en lugar de depositCosts)
}

export interface PreviewResult {
  validation: ValidationResult;
  transactions: ParsedTransaction[];
  duplicateCount: number;
  newCount: number;
  errors: string[];
  unknownOperationSamples: Record<string, UnknownOperationSample>;
  depositReviews: DepositReview[];  // depósitos externos que necesitan coste
}

export async function previewCsvFile(fileBuffer: Buffer, exchange: Exchange = 'binance'): Promise<PreviewResult> {
  const validation = validateExchangeCsv(exchange, fileBuffer);

  if (!validation.valid) {
    return {
      validation,
      transactions: [],
      duplicateCount: 0,
      newCount: 0,
      errors: validation.errors,
      unknownOperationSamples: {},
      depositReviews: [],
    };
  }

  const parseResult = await parseExchangeCsv(exchange, fileBuffer);

  // Construir muestras de operaciones desconocidas (solo aplica a Binance:
  // Bitvavo aborta directamente en el validator si encuentra un Type desconocido)
  const unknownOperationSamples: Record<string, UnknownOperationSample> = {};

  if (exchange === 'binance' && validation.unknownOperations.length > 0) {
    const rawRecords: Record<string, string>[] = parse(fileBuffer, {
      columns: true,
      skip_empty_lines: true,
      bom: true,
      trim: true,
    });

    for (const unknownOp of validation.unknownOperations) {
      const sample = rawRecords.find(r =>
        r['Operation'] === unknownOp || r['Operación'] === unknownOp
      );
      if (sample) {
        const timeRaw = sample['Time'] || sample['Tiempo'] || '';
        let timestamp = new Date().toISOString();
        try {
          const normalizedTime = /^\d{4}-/.test(timeRaw) ? timeRaw : '20' + timeRaw;
          timestamp = new Date(normalizedTime.replace(' ', 'T') + 'Z').toISOString();
        } catch { /* usar now */ }

        unknownOperationSamples[unknownOp] = {
          timestamp,
          asset: sample['Coin'] || sample['Moneda'] || '',
          amount: Math.abs(parseFloat(sample['Change'] || sample['Cambio'] || '0')),
          originalLabel: unknownOp,
        };
      }
    }
  }

  // Avisar si hay income ops que necesitarán precio histórico al importar.
  // DEPOSIT_CRYPTO se excluye: ya aparece en el panel de revisión obligatoria — no duplicar aviso.
  const INCOME_WARNING_OPS = new Set(['STAKING_REWARD', 'MINING_REWARD', 'LENDING_INTEREST', 'LENDING_INTEREST_LOCKED', 'CASHBACK', 'AIRDROP']);
  const incomeOpsCount = parseResult.transactions.filter(
    tx => INCOME_WARNING_OPS.has(tx.operationType) && !tx.pricePerUnit
  ).length;
  if (incomeOpsCount > 0) {
    validation.info.push(
      `${incomeOpsCount} operaciones de rendimiento (staking, interés, airdrop) necesitan precio histórico. ` +
      `Se consultará la API al confirmar — puede tardar unos segundos adicionales.`
    );
  }

  // Detectar gaps y solapamientos con imports existentes DEL MISMO EXCHANGE
  // (Binance y Bitvavo son historiales independientes — comparar fechas entre
  // ambos generaría falsos "gap sin datos" sin sentido)
  if (validation.dateRange) {
    const newFrom = new Date(validation.dateRange.from);
    const newTo = new Date(validation.dateRange.to);

    const existingRanges = await db.query(
      `SELECT
         ci.filename,
         MIN(t.timestamp)::date AS date_from,
         MAX(t.timestamp)::date AS date_to
       FROM csv_imports ci
       JOIN transactions t ON t.import_id = ci.id
       WHERE ci.exchange = $1
       GROUP BY ci.id, ci.filename
       ORDER BY MIN(t.timestamp)`,
      [exchange]
    );

    for (const range of existingRanges.rows) {
      const existFrom = new Date(range.date_from);
      const existTo = new Date(range.date_to);

      // Gap: nuevo CSV empieza después del fin del existente con hueco
      const daysBetween = Math.floor(
        (newFrom.getTime() - existTo.getTime()) / (1000 * 60 * 60 * 24)
      );

      if (daysBetween > 1) {
        validation.warnings.push(
          `Gap de ${daysBetween} dias sin datos: "${range.filename}" cubre hasta ${range.date_to} ` +
          `y este CSV empieza el ${validation.dateRange.from}. ` +
          `Considera exportar ese periodo desde ${exchange === 'binance' ? 'Binance' : 'Bitvavo'}.`
        );
      }

      // Gap inverso: CSV existente empieza después del fin del nuevo
      const daysBetweenInverse = Math.floor(
        (existFrom.getTime() - newTo.getTime()) / (1000 * 60 * 60 * 24)
      );

      if (daysBetweenInverse > 1) {
        validation.warnings.push(
          `Gap de ${daysBetweenInverse} dias sin datos: este CSV cubre hasta ${validation.dateRange.to} ` +
          `y "${range.filename}" empieza el ${range.date_from}. ` +
          `Considera exportar ese periodo desde ${exchange === 'binance' ? 'Binance' : 'Bitvavo'}.`
        );
      }
    }
  }

  // Contar duplicados — una sola query batch en lugar de N+1
  const allHashes = parseResult.transactions.flatMap(tx => tx.rawRowHashes);
  const existingRes = allHashes.length > 0
    ? await db.query('SELECT row_hash FROM raw_transactions WHERE row_hash = ANY($1)', [allHashes])
    : { rows: [] as { row_hash: string }[] };
  const existingHashes = new Set(existingRes.rows.map((r: { row_hash: string }) => r.row_hash));

  let duplicateCount = 0;
  let newCount = 0;
  for (const tx of parseResult.transactions) {
    if (tx.rawRowHashes.some(h => existingHashes.has(h))) duplicateCount++;
    else newCount++;
  }

  // Detectar depósitos externos que necesitan revisión de coste:
  // 1. Nuevos en este CSV
  // 2. Ya importados en DB pero sin price_per_unit
  const depositReviews: DepositReview[] = [];

  // Caso 1: nuevos depósitos en este CSV
  for (const tx of parseResult.transactions) {
    if (!tx.needsCostReview) continue;
    if (tx.rawRowHashes.some(h => existingHashes.has(h))) continue; // ya importado (ver caso 2)
    const txKey = tx.rawRowHashes[0];
    let historicalPrice: number | null = null;
    try { historicalPrice = await getHistoricalPriceEur(tx.asset, tx.timestamp); } catch { /* ignorar */ }
    depositReviews.push({ txKey, timestamp: tx.timestamp.toISOString(), asset: tx.asset, amount: tx.amount, historicalPrice });
  }

  // Caso 2: depósitos ya importados en DB pero sin coste — bloquean igual
  const existingPendingRes = await db.query(
    `SELECT id::text AS txkey, timestamp, asset, amount
     FROM transactions
     WHERE notes LIKE '%Depósito de cripto externo%' AND price_per_unit IS NULL
     ORDER BY timestamp`
  );
  for (const row of existingPendingRes.rows) {
    // No duplicar si ya está en depositReviews (txKey del CSV coincide)
    if (depositReviews.some(d => d.txKey === row.txkey)) continue;
    let historicalPrice: number | null = null;
    try { historicalPrice = await getHistoricalPriceEur(row.asset, new Date(row.timestamp)); } catch { /* ignorar */ }
    depositReviews.push({
      txKey: row.txkey,           // id UUID de la transacción — se usa en depositCosts
      timestamp: new Date(row.timestamp).toISOString(),
      asset: row.asset,
      amount: parseFloat(row.amount),
      historicalPrice,
      existingInDb: true,         // flag extra para distinguir en UI si hace falta
    });
  }

  return {
    validation,
    transactions: parseResult.transactions,
    duplicateCount,
    newCount,
    errors: parseResult.errors.map((e) => e.message),
    unknownOperationSamples,
    depositReviews,
  };
}
