import { createHash } from 'crypto';
import { parse } from 'csv-parse/sync';
import { PoolClient } from 'pg';
import { db } from '../../db/client';
import { parseBinanceCsv } from './parser';
import { validateCsvStructure, ValidationResult } from './validator';
import { ParsedTransaction } from './types';

export interface ImportResult {
  importId: string;
  totalRows: number;
  newTransactions: number;
  duplicateRows: number;
  ignoredRows: number;
  errors: string[];
  warnings: string[];
  validation: ValidationResult;
}

export interface UnknownOperationSample {
  timestamp: string;
  asset: string;
  amount: number;
  originalLabel: string;
}

export interface PreviewResult {
  validation: ValidationResult;
  transactions: ParsedTransaction[];
  duplicateCount: number;
  newCount: number;
  errors: string[];
  unknownOperationSamples: Record<string, UnknownOperationSample>;
}

export async function previewCsvFile(fileBuffer: Buffer): Promise<PreviewResult> {
  const validation = validateCsvStructure(fileBuffer);

  if (!validation.valid) {
    return {
      validation,
      transactions: [],
      duplicateCount: 0,
      newCount: 0,
      errors: validation.errors,
      unknownOperationSamples: {},
    };
  }

  const parseResult = parseBinanceCsv(fileBuffer);

  // Construir muestras de operaciones desconocidas
  const unknownOperationSamples: Record<string, UnknownOperationSample> = {};

  if (validation.unknownOperations.length > 0) {
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
          timestamp = new Date('20' + timeRaw.replace(' ', 'T') + 'Z').toISOString();
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

  let duplicateCount = 0;
  let newCount = 0;

  for (const tx of parseResult.transactions) {
    let isDuplicate = false;
    for (const hash of tx.rawRowHashes) {
      const dup = await db.query(
        'SELECT id FROM raw_transactions WHERE row_hash = $1',
        [hash]
      );
      if (dup.rows.length > 0) {
        isDuplicate = true;
        break;
      }
    }
    if (isDuplicate) {
      duplicateCount++;
    } else {
      newCount++;
    }
  }

  return {
    validation,
    transactions: parseResult.transactions,
    duplicateCount,
    newCount,
    errors: parseResult.errors.map((e) => e.message),
    unknownOperationSamples,
  };
}

export async function importCsvFile(
  fileBuffer: Buffer,
  filename: string
): Promise<ImportResult> {
  const validation = validateCsvStructure(fileBuffer);
  if (!validation.valid) {
    throw new Error(validation.errors.join(' | '));
  }

  const fileHash = createHash('sha256').update(fileBuffer).digest('hex');
  const parseResult = parseBinanceCsv(fileBuffer);

  if (parseResult.errors.length > 0) {
    throw new Error(
      `El CSV contiene ${parseResult.errors.length} errores de parseo: ` +
      parseResult.errors.map((e) => e.message).join(' | ')
    );
  }

  const existing = await db.query(
    'SELECT id, filename FROM csv_imports WHERE file_hash = $1',
    [fileHash]
  );
  if (existing.rows.length > 0) {
    throw new Error(
      `Este CSV exacto ya fue importado (${existing.rows[0].filename}). ` +
      `Si quieres importar un rango solapado, el sistema detectará automáticamente las filas nuevas.`
    );
  }

  return await db.transaction(async (client) => {
    const importRes = await client.query(
      `INSERT INTO csv_imports (filename, file_hash, row_count, skipped_count)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [filename, fileHash, parseResult.stats.totalRows, parseResult.stats.ignoredRows]
    );
    const importId: string = importRes.rows[0].id;

    let newTransactions = 0;
    let duplicateRows = 0;

    for (const tx of parseResult.transactions) {
      const txId = await insertTransaction(client, tx, importId);
      if (txId) {
        newTransactions++;
      } else {
        duplicateRows++;
      }
    }

    await client.query(
      `UPDATE csv_imports SET row_count = $1, skipped_count = $2 WHERE id = $3`,
      [
        parseResult.stats.totalRows,
        parseResult.stats.ignoredRows + duplicateRows,
        importId,
      ]
    );

    return {
      importId,
      totalRows: parseResult.stats.totalRows,
      newTransactions,
      duplicateRows,
      ignoredRows: parseResult.stats.ignoredRows,
      errors: [],
      warnings: validation.warnings,
      validation,
    };
  });
}

async function insertTransaction(
  client: PoolClient,
  tx: ParsedTransaction,
  importId: string
): Promise<string | null> {
  for (const hash of tx.rawRowHashes) {
    const dup = await client.query(
      'SELECT id FROM raw_transactions WHERE row_hash = $1',
      [hash]
    );
    if (dup.rows.length > 0) return null;
  }

  const txRes = await client.query(
    `INSERT INTO transactions (
      import_id, operation_type, timestamp,
      asset, amount, amount_net,
      cost_asset, cost_amount, price_per_unit,
      fee_asset, fee_amount,
      wallet, account,
      sub_trade_count, notes, manually_added
    ) VALUES (
      $1, $2::operation_type, $3,
      $4, $5, $6,
      $7, $8, $9,
      $10, $11,
      $12::wallet_type, $13,
      $14, $15, false
    ) RETURNING id`,
    [
      importId,
      tx.operationType,
      tx.timestamp,
      tx.asset,
      tx.amount,
      tx.amountNet,
      tx.costAsset ?? null,
      tx.costAmount ?? null,
      tx.pricePerUnit ?? null,
      tx.feeAsset ?? null,
      tx.feeAmount ?? null,
      tx.wallet,
      tx.account,
      tx.subTradeCount,
      tx.notes ?? null,
    ]
  );
  const txId: string = txRes.rows[0].id;

  for (const hash of tx.rawRowHashes) {
    await client.query(
      `INSERT INTO raw_transactions
       (import_id, user_id, time, account, operation, coin, change, remark, row_hash, transaction_id)
       VALUES ($1, '', $2, '', '', '', 0, '', $3, $4)
       ON CONFLICT (row_hash) DO NOTHING`,
      [importId, tx.timestamp, hash, txId]
    );
  }

  return txId;
}