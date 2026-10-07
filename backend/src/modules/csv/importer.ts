import { createHash, randomUUID } from 'crypto';
import { db } from '../../db/client';
import { ValidationResult } from './validator';
import { ParsedTransaction } from './types';
import { Exchange, parseExchangeCsv, validateExchangeCsv } from './exchanges';
import { refreshLivePrices } from '../prices/binance';
import { getOrDetectPairInfo } from '../prices/pairDetector';
import { enrichIncomeTransactionsWithPrices } from './importerEnrichment';
import { buildTransferDestinationMap, resolveWalletId, resolveDestinationWalletId } from './importerTransferDestinations';

export { previewCsvFile } from './importerPreview';
export type { UnknownOperationSample, DepositReview, PreviewResult } from './importerPreview';

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

export async function importCsvFile(
  fileBuffer: Buffer,
  filename: string,
  withdrawalDestinations: Record<string, string> = {},
  depositCosts: Record<string, number> = {},
  onProgress?: (done: number, total: number, asset?: string, operation?: string) => void,
  onStatus?: (message: string, progress?: number, total?: number) => void,
  exchange: Exchange = 'binance',
): Promise<ImportResult> {
  const validation = validateExchangeCsv(exchange, fileBuffer);
  if (!validation.valid) {
    throw new Error(validation.errors.join(' | '));
  }

  onStatus?.('Parseando CSV...');
  const fileHash = createHash('sha256').update(fileBuffer).digest('hex');
  const parseResult = await parseExchangeCsv(exchange, fileBuffer);

  // Modo degradado: un grupo no reconocido (ej. Binance renombra una
  // operación) no debe bloquear el CSV entero — se importa lo que sí se
  // reconoce y se reporta el resto como error visible en el resultado, en
  // vez de descartar también las transacciones ya correctamente parseadas.
  if (parseResult.errors.length > 0) {
    onStatus?.(
      `⚠ ${parseResult.errors.length} fila(s) con operación no reconocida — se excluyen, el resto del CSV se importa igualmente.`
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

  await enrichIncomeTransactionsWithPrices(parseResult.transactions, onStatus);

  // Mapa de destino de transferencias internas — solo aplica a Binance:
  // es el único exchange con TRANSFER_INTERNAL (Bitvavo es cuenta única,
  // sin sub-wallets; su rawRows queda vacío y el mapa resultante también).
  const transferDestByHash = buildTransferDestinationMap(parseResult.rawRows);

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

    const importRes = await client.query(
      `INSERT INTO csv_imports (filename, file_hash, row_count, skipped_count, exchange)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [filename, fileHash, parseResult.stats.totalRows, parseResult.stats.ignoredRows, exchange]
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
      const walletId = resolveWalletId(tx.account, walletIdByName);
      let destinationWalletId: string | null = null;
      let effectiveOpType = tx.operationType;

      if (tx.operationType === 'TRANSFER_INTERNAL') {
        destinationWalletId = resolveDestinationWalletId(tx.notes, tx.account, tx.rawRowHashes[0], transferDestByHash, walletIdByName);
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
      errors: parseResult.errors.map((e) => e.message),
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
