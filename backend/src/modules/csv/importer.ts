import { createHash, randomUUID } from 'crypto';
import { parse } from 'csv-parse/sync';
import { db } from '../../db/client';
import { parseBinanceCsv } from './parser';
import { validateCsvStructure, ValidationResult } from './validator';
import { ParsedTransaction } from './types';
import { ACCOUNT_TO_WALLET, TRANSFER_DESTINATIONS } from './binanceAccounts';
import { getHistoricalPriceEur, refreshLivePrices } from '../prices/binance';
import { setCoinGeckoStatusCallback } from '../prices/coingecko';
import { getOrDetectPairInfo } from '../prices/pairDetector';

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
      `Se consultará la API de Binance al confirmar — puede tardar unos segundos adicionales.`
    );
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
  depositCosts: Record<string, number> = {},
  onProgress?: (done: number, total: number, asset?: string, operation?: string) => void,
  onStatus?: (message: string, progress?: number, total?: number) => void,
): Promise<ImportResult> {
  const validation = validateCsvStructure(fileBuffer);
  if (!validation.valid) {
    throw new Error(validation.errors.join(' | '));
  }

  onStatus?.('Parseando CSV...');
  const fileHash = createHash('sha256').update(fileBuffer).digest('hex');
  const parseResult = parseBinanceCsv(fileBuffer);

  if (parseResult.errors.length > 0) {
    throw new Error(
      `El CSV contiene ${parseResult.errors.length} errores de parseo: ` +
      parseResult.errors.map((e) => e.message).join(' | ')
    );
  }

  onStatus?.(`CSV parseado: ${parseResult.transactions.length} transacciones encontradas`);

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

  // Enriquecer operaciones de rendimiento con precio histórico al momento de recepción.
  // Esto garantiza que price_per_unit quede guardado en la BD para el módulo fiscal
  // e historial (el motor FIFO tiene su propio fallback, pero la tabla transactions
  // quedaría con NULL sin este paso, y el fiscal mostraría 0 EUR).
  // DEPOSIT_CRYPTO se incluye para tener precio de referencia como estimación del coste
  const INCOME_OP_TYPES = new Set(['STAKING_REWARD', 'MINING_REWARD', 'LENDING_INTEREST', 'LENDING_INTEREST_LOCKED', 'CASHBACK', 'AIRDROP', 'DEPOSIT_CRYPTO']);
  const incomeTxs = parseResult.transactions.filter(
    tx => INCOME_OP_TYPES.has(tx.operationType) && !tx.pricePerUnit
  );
  if (incomeTxs.length > 0) {
    // Deduplicar pares únicos (symbol|fecha) y agrupar las txs que los comparten
    const uniquePairsMap = new Map<string, { symbol: string; date: Date; txList: ParsedTransaction[] }>();
    for (const tx of incomeTxs) {
      const key = `${tx.asset}|${tx.timestamp.toISOString().slice(0, 10)}`;
      if (!uniquePairsMap.has(key)) {
        uniquePairsMap.set(key, { symbol: tx.asset, date: tx.timestamp, txList: [] });
      }
      uniquePairsMap.get(key)!.txList.push(tx);
    }
    const uniquePairs = [...uniquePairsMap.values()];

    const totalPairs = uniquePairs.length;
    onStatus?.(`Enriqueciendo ${incomeTxs.length} operaciones de rendimiento — ${totalPairs} pares únicos (concurrencia 10)`, 0, totalPairs);

    // Enganchar el callback de CoinGecko para que rate limits aparezcan en el log
    setCoinGeckoStatusCallback(onStatus);

    // Concurrencia 10: Binance no tiene rate limit estricto, los pares que
    // recaigan en CoinGecko quedan serializados automáticamente por su cola.
    let completed = 0;
    const PRICE_CONCURRENCY = 10;
    for (let i = 0; i < uniquePairs.length; i += PRICE_CONCURRENCY) {
      const batch = uniquePairs.slice(i, i + PRICE_CONCURRENCY);
      await Promise.allSettled(
        batch.map(async ({ symbol, date, txList }) => {
          const dateStr = date.toISOString().slice(0, 10);
          onStatus?.(`Consultando ${symbol} @ ${dateStr}...`);
          try {
            const price = await getHistoricalPriceEur(symbol, date);
            completed++;
            if (price > 0) {
              onStatus?.(`✓ ${symbol} @ ${dateStr} = ${price.toFixed(4)} €`, completed, totalPairs);
              for (const tx of txList) {
                tx.pricePerUnit = price;
                tx.costAsset    = 'EUR';
                tx.costAmount   = tx.amount * price;
              }
            } else {
              onStatus?.(`— ${symbol} @ ${dateStr} sin precio`, completed, totalPairs);
            }
          } catch (e) {
            completed++;
            onStatus?.(`⚠ ${symbol} @ ${dateStr} error: ${(e as Error).message}`, completed, totalPairs);
          }
        })
      );
    }

    setCoinGeckoStatusCallback(undefined);
    onStatus?.(`Precios de rendimiento completados: ${totalPairs} pares procesados`);
  }

  onStatus?.('Iniciando transacción en base de datos...');
  const result = await db.transaction(async (client) => {
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

    onStatus?.('Cargando hashes existentes para detección de duplicados...');
    // Batch check duplicados — también recuperamos transaction_id + op_type para detectar
    // registros que existían con una clasificación antigua y que ahora deben actualizarse
    // (p.ej. Asset Recovery importado como WITHDRAW antes de que añadiéramos el mapeo a LOST).
    const allTxHashes = parseResult.transactions.flatMap(tx => tx.rawRowHashes);
    const existingInDb = allTxHashes.length > 0
      ? await client.query(
          `SELECT rt.row_hash, t.id AS transaction_id, t.operation_type, t.destination_pending
           FROM raw_transactions rt
           JOIN transactions t ON t.id = rt.transaction_id
           WHERE rt.row_hash = ANY($1)`,
          [allTxHashes]
        )
      : { rows: [] as { row_hash: string; transaction_id: string; operation_type: string; destination_pending: boolean }[] };
    const existingHashSet = new Set(existingInDb.rows.map((r) => r.row_hash));
    // Mapa hash → {transaction_id, operation_type} para detectar cambios de clasificación
    const existingHashMeta = new Map(existingInDb.rows.map((r) => [r.row_hash, r]));
    onStatus?.(`${existingHashSet.size} duplicados detectados. Insertando transacciones nuevas...`);

    let newTransactions = 0;
    let duplicateRows = 0;
    const totalTx = parseResult.transactions.length;
    let processed = 0;

    // ── Preparación (sin DB): clasificar cada tx y resolver metadatos síncronos ──
    // Los STAKING/LAUNCHPOOL_UNLOCK necesitan una SELECT por cada uno para encontrar
    // su LOCK (que debe estar ya insertado), así que se separan para un segundo paso.
    interface InsertRow {
      id: string;
      tx: ParsedTransaction;
      walletId: string;
      destinationWalletId: string | null;
      effectiveOpType: string;
      depositPriceOverride: number | null;
      linkedTxId: string | null;
    }

    const normalRows: InsertRow[] = [];
    const unlockRows: InsertRow[] = [];
    // Registros existentes que deben actualizarse porque su clasificación cambió
    // (p.ej. WITHDRAW con destination_pending que ahora el parser clasifica como LOST)
    const upgradeRows: { transactionId: string; newOpType: string }[] = [];

    for (const tx of parseResult.transactions) {
      processed++;
      if (tx.rawRowHashes.some(h => existingHashSet.has(h))) {
        duplicateRows++;
        // Detectar si la clasificación ha mejorado (e.g. WITHDRAW → LOST)
        const existingHash = tx.rawRowHashes.find(h => existingHashSet.has(h));
        if (existingHash) {
          const meta = existingHashMeta.get(existingHash);
          if (
            meta &&
            meta.destination_pending &&
            meta.operation_type === 'WITHDRAW' &&
            (tx.operationType === 'LOST' || tx.operationType === 'GIFT_SENT')
          ) {
            upgradeRows.push({ transactionId: meta.transaction_id, newOpType: tx.operationType });
          }
        }
        onProgress?.(processed, totalTx, tx.asset, tx.operationType);
        continue;
      }

      const id = randomUUID();
      const walletId = getWalletId(tx.account);
      let destinationWalletId: string | null = null;
      let effectiveOpType = tx.operationType;

      if (tx.operationType === 'TRANSFER_INTERNAL') {
        destinationWalletId = getDestinationWalletId(tx.notes, tx.account);
      } else if (tx.operationType === 'WITHDRAW') {
        const txKey = tx.rawRowHashes[0] ?? tx.asset;
        const dest  = withdrawalDestinations[txKey] ?? withdrawalDestinations[tx.asset];
        if (dest === '__lost__') {
          effectiveOpType = 'LOST';
        } else if (dest === '__gift__') {
          effectiveOpType = 'GIFT_SENT';
        } else if (dest === '__external__') {
          const extWallet = walletsRes.rows.find((r: { name: string }) => r.name === 'Wallets externas');
          destinationWalletId = extWallet?.id ?? null;
        } else {
          destinationWalletId = dest ?? null;
        }
      }

      const depositPriceOverride = tx.needsCostReview
        ? (depositCosts[tx.rawRowHashes[0]] ?? null)
        : null;

      const row: InsertRow = { id, tx, walletId, destinationWalletId, effectiveOpType, depositPriceOverride, linkedTxId: null };

      if (tx.operationType === 'STAKING_UNLOCK' || tx.operationType === 'LAUNCHPOOL_UNLOCK') {
        unlockRows.push(row);
      } else {
        normalRows.push(row);
      }

      onProgress?.(processed, totalTx, tx.asset, effectiveOpType);
    }

    // ── Paso A: batch INSERT de todas las transacciones normales ──────────────
    // Una sola query por chunk de 500 en lugar de una por tx → ~100x más rápido
    if (normalRows.length > 0) {
      onStatus?.(`Insertando ${normalRows.length} transacciones en batch...`);
      const CHUNK = 500;
      for (let i = 0; i < normalRows.length; i += CHUNK) {
        const chunk = normalRows.slice(i, i + CHUNK);
        const params: unknown[] = [];
        const valueClauses: string[] = [];
        for (const row of chunk) {
          const { id, tx, walletId, destinationWalletId, effectiveOpType, depositPriceOverride } = row;
          const isWithdrawType = ['WITHDRAW', 'LOST', 'GIFT_SENT'].includes(effectiveOpType);
          const destPending = isWithdrawType && !destinationWalletId;
          const finalPricePerUnit = depositPriceOverride ?? tx.pricePerUnit ?? null;
          const finalCostAmount = depositPriceOverride
            ? tx.amount * depositPriceOverride
            : (tx.costAmount ?? null);
          const b = params.length;
          params.push(
            id, importId, effectiveOpType, tx.timestamp,
            tx.asset, tx.amount, tx.amountNet,
            tx.costAsset ?? null, finalCostAmount, finalPricePerUnit,
            tx.feeAsset ?? null, tx.feeAmount ?? null,
            walletId, tx.account, tx.notes ?? null,
            destinationWalletId, destPending,
          );
          valueClauses.push(
            `($${b+1},$${b+2},$${b+3}::operation_type,$${b+4},$${b+5},$${b+6},$${b+7},$${b+8},$${b+9},$${b+10},$${b+11},$${b+12},$${b+13},$${b+14},$${b+15},false,$${b+16},$${b+17},NULL)`
          );
        }
        await client.query(
          `INSERT INTO transactions
           (id,import_id,operation_type,timestamp,asset,amount,amount_net,
            cost_asset,cost_amount,price_per_unit,fee_asset,fee_amount,
            wallet_id,account,notes,manually_added,destination_wallet_id,destination_pending,linked_tx_id)
           VALUES ${valueClauses.join(',')}`,
          params
        );
        newTransactions += chunk.length;
      }
    }

    // ── Paso B: STAKING/LAUNCHPOOL_UNLOCK — buscar LOCK + INSERT individual ───
    // No usamos notes para el match: Binance renombra productos a mitad de ciclo
    // (ej. "Staking Purchase" redimido como "Simple Earn Locked Redemption").
    // FIFO puro (timestamp ASC) es correcto.
    for (const row of unlockRows) {
      const isLaunchpool = row.effectiveOpType === 'LAUNCHPOOL_UNLOCK';
      const lockType   = isLaunchpool ? 'LAUNCHPOOL_LOCK'  : 'STAKING_LOCK';
      const unlockType = row.effectiveOpType;
      const matchRes = await client.query(
        `SELECT id FROM transactions
         WHERE operation_type = $1 AND wallet_id = $2 AND asset = $3
           AND id NOT IN (
             SELECT linked_tx_id FROM transactions
             WHERE linked_tx_id IS NOT NULL AND operation_type = $4
           )
         ORDER BY timestamp ASC LIMIT 1`,
        [lockType, row.walletId, row.tx.asset, unlockType]
      );
      row.linkedTxId = matchRes.rows[0]?.id ?? null;

      const { id, tx, walletId, destinationWalletId, effectiveOpType, depositPriceOverride, linkedTxId } = row;
      const finalPricePerUnit = depositPriceOverride ?? tx.pricePerUnit ?? null;
      const finalCostAmount = depositPriceOverride ? tx.amount * depositPriceOverride : (tx.costAmount ?? null);
      await client.query(
        `INSERT INTO transactions
         (id,import_id,operation_type,timestamp,asset,amount,amount_net,
          cost_asset,cost_amount,price_per_unit,fee_asset,fee_amount,
          wallet_id,account,notes,manually_added,destination_wallet_id,destination_pending,linked_tx_id)
         VALUES ($1,$2,$3::operation_type,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,false,$16,$17,$18)`,
        [id, importId, effectiveOpType, tx.timestamp,
         tx.asset, tx.amount, tx.amountNet,
         tx.costAsset ?? null, finalCostAmount, finalPricePerUnit,
         tx.feeAsset ?? null, tx.feeAmount ?? null,
         walletId, tx.account, tx.notes ?? null,
         destinationWalletId, false, linkedTxId]
      );
      newTransactions++;
    }

    // ── Paso D: actualizar registros reclasificados ───────────────────────────
    // Registros que existían como WITHDRAW pendiente y el parser ahora reconoce como LOST.
    if (upgradeRows.length > 0) {
      onStatus?.(`Actualizando ${upgradeRows.length} registros reclasificados...`);
      for (const { transactionId, newOpType } of upgradeRows) {
        await client.query(
          `UPDATE transactions
           SET operation_type = $1::operation_type,
               destination_wallet_id = NULL,
               destination_pending = FALSE
           WHERE id = $2`,
          [newOpType, transactionId]
        );
      }
    }

    // ── Paso C: batch INSERT de raw_transactions para todas ──────────────────
    const allRows = [...normalRows, ...unlockRows];
    if (allRows.length > 0) {
      onStatus?.(`Guardando ${allRows.length} hashes en raw_transactions...`);
      const CHUNK = 500;
      const allHashes = allRows.flatMap(row =>
        row.tx.rawRowHashes.map(hash => ({ hash, row }))
      );
      for (let i = 0; i < allHashes.length; i += CHUNK) {
        const chunk = allHashes.slice(i, i + CHUNK);
        const params: unknown[] = [];
        const valueClauses: string[] = [];
        for (const { hash, row } of chunk) {
          const { id, tx } = row;
          const b = params.length;
          params.push(importId, tx.timestamp, tx.account, tx.operationType, tx.asset, tx.amount, tx.notes ?? '', hash, id);
          valueClauses.push(`($${b+1},'',$${b+2},$${b+3},$${b+4},$${b+5},$${b+6},$${b+7},$${b+8},$${b+9})`);
        }
        await client.query(
          `INSERT INTO raw_transactions
           (import_id,user_id,time,account,operation,coin,change,remark,row_hash,transaction_id)
           VALUES ${valueClauses.join(',')}
           ON CONFLICT (row_hash) DO NOTHING`,
          params
        );
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

  // Auto-detectar pares de precio para TODOS los activos del CSV, no solo los de income.
  // Esto garantiza que cualquier activo nuevo (comprado, recibido, etc.) quede en
  // asset_metadata con sus pares de Binance y con precio en tiempo real disponible
  // sin necesitar reiniciar el backend.
  const allAssets = [...new Set(
    parseResult.transactions
      .map(tx => tx.asset)
      .filter(a => a && a !== 'EUR')
  )];
  if (allAssets.length > 0) {
    // getOrDetectPairInfo inserta en asset_metadata si no existe y actualiza pares.
    // refreshLivePrices carga el precio actual en el liveCache del proceso.
    await Promise.allSettled(allAssets.map(a => getOrDetectPairInfo(a)));
    await refreshLivePrices(allAssets);
  }

  return result;
}

