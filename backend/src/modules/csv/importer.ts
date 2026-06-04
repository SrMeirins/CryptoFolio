import { createHash } from 'crypto';
import { parse } from 'csv-parse/sync';
import { PoolClient } from 'pg';
import { db } from '../../db/client';
import { parseBinanceCsv } from './parser';
import { validateCsvStructure, ValidationResult } from './validator';
import { ParsedTransaction } from './types';
import { ACCOUNT_TO_WALLET, TRANSFER_DESTINATIONS } from './binanceAccounts';
import { getHistoricalPriceEur } from '../prices/binance';

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
      depositReviews: [],
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

  // Detectar gaps y solapamientos con imports existentes
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
       GROUP BY ci.id, ci.filename
       ORDER BY MIN(t.timestamp)`
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
          `Considera exportar ese periodo desde Binance.`
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
          `Considera exportar ese periodo desde Binance.`
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

export async function importCsvFile(
  fileBuffer: Buffer,
  filename: string,
  withdrawalDestinations: Record<string, string> = {},
  depositCosts: Record<string, number> = {}   // txKey → pricePerUnit (EUR)
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
    // Cargar todas las wallets de sistema para asignar wallet_id correctamente
    const walletsRes = await client.query(
      `SELECT id, name, type FROM wallets WHERE is_system = TRUE`
    );
    if (walletsRes.rows.length === 0) throw new Error('No hay wallets configuradas en el sistema');

    const walletIdByName: Record<string, string> = {};
    for (const row of walletsRes.rows as { id: string; name: string }[]) {
      walletIdByName[row.name] = row.id;
    }
    const fallbackWalletId = walletsRes.rows[0].id;

    // Resuelve el wallet_id para una cuenta CSV ('Spot', 'Funding', etc.)
    function getWalletId(account: string): string {
      const name = ACCOUNT_TO_WALLET[account];
      return (name && walletIdByName[name]) ? walletIdByName[name] : fallbackWalletId;
    }

    // Resuelve el wallet_id destino para una transferencia interna
    function getDestinationWalletId(notes: string | undefined, account: string): string | null {
      if (!notes) return null;
      const destName = TRANSFER_DESTINATIONS[notes]?.[account];
      if (!destName) return null;
      return walletIdByName[destName] ?? null;
    }

    const importRes = await client.query(
      `INSERT INTO csv_imports (filename, file_hash, row_count, skipped_count)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [filename, fileHash, parseResult.stats.totalRows, parseResult.stats.ignoredRows]
    );
    const importId: string = importRes.rows[0].id;

    // Batch check duplicados dentro de la transacción
    const allTxHashes = parseResult.transactions.flatMap(tx => tx.rawRowHashes);
    const existingInDb = allTxHashes.length > 0
      ? await client.query('SELECT row_hash FROM raw_transactions WHERE row_hash = ANY($1)', [allTxHashes])
      : { rows: [] as { row_hash: string }[] };
    const existingHashSet = new Set(existingInDb.rows.map((r: { row_hash: string }) => r.row_hash));

    let newTransactions = 0;
    let duplicateRows = 0;

    for (const tx of parseResult.transactions) {
      if (tx.rawRowHashes.some(h => existingHashSet.has(h))) {
        duplicateRows++;
        continue;
      }
      const walletId = getWalletId(tx.account);
      let destinationWalletId: string | null = null;
      let effectiveOpType = tx.operationType;

      if (tx.operationType === 'TRANSFER_INTERNAL') {
        destinationWalletId = getDestinationWalletId(tx.notes, tx.account);
      } else if (tx.operationType === 'WITHDRAW') {
        // Buscar destino por txKey (rawRowHashes[0]) → más granular que por activo.
        // Fallback al activo para compatibilidad con importaciones anteriores.
        const txKey = tx.rawRowHashes[0] ?? tx.asset;
        const dest  = withdrawalDestinations[txKey] ?? withdrawalDestinations[tx.asset];

        if (dest === '__lost__') {
          // Pérdida de acceso → LOST
          // FIFO consume el lote a 0 proceeds → pérdida patrimonial
          effectiveOpType = 'LOST';
          destinationWalletId = null;
        } else if (dest === '__gift__') {
          // Regalo, donación o pago a tercero → GIFT_SENT
          // FIFO procesa como venta al precio de mercado → transmisión patrimonial
          // G/P = precio de mercado en fecha de envío − coste de adquisición
          effectiveOpType = 'GIFT_SENT';
          destinationWalletId = null;
        } else if (dest === '__external__') {
          // Retirado a wallet externa no rastreada (MetaMask, otro exchange…)
          // El lote se mueve a la wallet "Wallets externas" del sistema
          const extWallet = walletsRes.rows.find(
            (r: { name: string }) => r.name === 'Wallets externas'
          );
          destinationWalletId = extWallet?.id ?? null;
        } else {
          // Wallet fría del usuario
          destinationWalletId = dest ?? null;
        }
      }

      // Coste de adquisición para depósitos externos
      const depositPriceOverride = tx.needsCostReview
        ? (depositCosts[tx.rawRowHashes[0]] ?? null)
        : null;

      await insertTransaction(client, tx, importId, walletId, destinationWalletId, effectiveOpType, depositPriceOverride);
      newTransactions++;
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
  importId: string,
  walletId: string,
  destinationWalletId: string | null = null,
  operationTypeOverride?: string,
  depositPriceOverride: number | null = null,
): Promise<void> {
  const opType = operationTypeOverride ?? tx.operationType;
  // WITHDRAW sin destino asignado → pending (usuario lo asignará después)
  const isWithdraw  = opType === 'WITHDRAW';
  const destPending = isWithdraw && !destinationWalletId;
  const destId      = destinationWalletId;

  // Para depósitos externos: usar precio override si fue provisto
  const finalPricePerUnit = depositPriceOverride ?? tx.pricePerUnit ?? null;
  const finalCostAmount   = depositPriceOverride
    ? tx.amount * depositPriceOverride
    : (tx.costAmount ?? null);

  const txRes = await client.query(
    `INSERT INTO transactions (
      import_id, operation_type, timestamp,
      asset, amount, amount_net,
      cost_asset, cost_amount, price_per_unit,
      fee_asset, fee_amount,
      wallet_id, account,
      notes, manually_added,
      destination_wallet_id, destination_pending
    ) VALUES (
      $1, $2::operation_type, $3,
      $4, $5, $6,
      $7, $8, $9,
      $10, $11,
      $12, $13,
      $14, false,
      $15, $16
    ) RETURNING id`,
    [
      importId,
      opType,
      tx.timestamp,
      tx.asset,
      tx.amount,
      tx.amountNet,
      tx.costAsset ?? null,
      finalCostAmount,
      finalPricePerUnit,
      tx.feeAsset ?? null,
      tx.feeAmount ?? null,
      walletId,
      tx.account,
      tx.notes ?? null,
      destId,
      destPending,
    ]
  );
  const txId: string = txRes.rows[0].id;

  // Guardar datos reales del CSV en raw_transactions (no strings vacíos)
  for (const hash of tx.rawRowHashes) {
    await client.query(
      `INSERT INTO raw_transactions
       (import_id, user_id, time, account, operation, coin, change, remark, row_hash, transaction_id)
       VALUES ($1, '', $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (row_hash) DO NOTHING`,
      [
        importId,
        tx.timestamp,
        tx.account,
        tx.operationType,
        tx.asset,
        tx.amount,
        tx.notes ?? '',
        hash,
        txId,
      ]
    );
  }
}