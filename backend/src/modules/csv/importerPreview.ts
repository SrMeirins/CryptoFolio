import { parse } from 'csv-parse/sync';
import { db } from '../../db/client';
import { ValidationResult } from './validator';
import { ParsedTransaction } from './types';
import { Exchange, parseExchangeCsv, validateExchangeCsv } from './exchanges';
import { getHistoricalPriceEur } from '../prices/binance';
import { normalizeBinanceYear } from './csvUtils';
import { destinosDeRetiros } from './retiradas/destinosDb';
import type { DestinoRetiro, ResumenRetiradas } from './retiradas/resolverDestinos';

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
  /** Qué se revisa: un depósito externo o una compra con fiat sin su pago en el CSV (#435). */
  kind?: 'deposito' | 'compra';
}

export interface PreviewResult {
  validation: ValidationResult;
  transactions: Array<ParsedTransaction & { isNew?: boolean; destino?: DestinoRetiro }>;
  duplicateCount: number;
  newCount: number;
  errors: string[];
  unknownOperationSamples: Record<string, UnknownOperationSample>;
  depositReviews: DepositReview[];  // depósitos externos que necesitan coste
  /** Historial de retiradas de Binance aportado (#320): cuántas se han emparejado. */
  retiradas?: ResumenRetiradas | null;
  /** Filas ya importadas sin su fila original que este archivo puede completar (#374). */
  originalRowsMissing?: number;
}

export async function previewCsvFile(fileBuffer: Buffer, exchange: Exchange = 'binance', retiradasBuffers: readonly Buffer[] = []): Promise<PreviewResult> {
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
          const normalizedTime = normalizeBinanceYear(timeRaw);
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

  // Los huecos de cobertura ya no se avisan aquí, archivo contra archivo: los calcula
  // la ruta con todo el lote y lo ya importado (#328, modules/csv/cobertura.ts).

  // Contar duplicados — una sola query batch en lugar de N+1
  const allHashes = parseResult.transactions.flatMap(tx => tx.rawRowHashes);
  const existingRes = allHashes.length > 0
    ? await db.query('SELECT row_hash FROM raw_transactions WHERE row_hash = ANY($1)', [allHashes])
    : { rows: [] as { row_hash: string }[] };
  const existingHashes = new Set(existingRes.rows.map((r: { row_hash: string }) => r.row_hash));

  // Filas guardadas antes de #374 que este archivo puede completar.
  const rawHashes = parseResult.rawRows.map(r => r.hash);
  const missingRes = rawHashes.length > 0
    ? await db.query('SELECT count(*)::int AS n FROM raw_transactions WHERE row_hash = ANY($1) AND original_row IS NULL', [rawHashes])
    : { rows: [{ n: 0 }] };
  const originalRowsMissing = Number(missingRes.rows[0]?.n ?? 0);

  let duplicateCount = 0;
  let newCount = 0;
  for (const tx of parseResult.transactions) {
    if (tx.rawRowHashes.some(h => existingHashes.has(h))) duplicateCount++;
    else newCount++;
  }

  // Avisar si hay income ops que necesitarán precio histórico al importar.
  // DEPOSIT_CRYPTO se excluye: ya aparece en el panel de revisión obligatoria — no duplicar aviso.
  const INCOME_WARNING_OPS = new Set(['STAKING_REWARD', 'MINING_REWARD', 'LENDING_INTEREST', 'LENDING_INTEREST_LOCKED', 'CASHBACK', 'AIRDROP']);
  // Solo las filas nuevas (#316): las ya importadas no vuelven a consultar precios.
  const incomeOpsCount = parseResult.transactions.filter(
    tx => INCOME_WARNING_OPS.has(tx.operationType) && !tx.pricePerUnit && !tx.rawRowHashes.some(h => existingHashes.has(h))
  ).length;
  if (incomeOpsCount > 0) {
    validation.info.push(
      `${incomeOpsCount} operaciones de rendimiento (staking, interés, airdrop) necesitan precio histórico. ` +
      `Se consultará la API al confirmar — puede tardar unos segundos adicionales.`
    );
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
    depositReviews.push({
      txKey, timestamp: tx.timestamp.toISOString(), asset: tx.asset, amount: tx.amount, historicalPrice,
      kind: tx.orphanFiatBuy ? 'compra' : 'deposito',
    });
  }

  // Caso 3 (#435): compra huérfana ya importada como airdrop, sin editar a mano.
  // Al confirmar se reclasifica como compra; aquí se pide su coste.
  const orphans = parseResult.transactions.filter(tx => tx.orphanFiatBuy && tx.rawRowHashes.some(h => existingHashes.has(h)));
  if (orphans.length > 0) {
    const misclassified = await db.query(
      `SELECT DISTINCT t.id::text AS id, t.timestamp, t.asset, t.amount
       FROM raw_transactions rt JOIN transactions t ON t.id = rt.transaction_id
       WHERE rt.row_hash = ANY($1) AND t.operation_type = 'AIRDROP' AND t.original_import IS NULL`,
      [orphans.flatMap(tx => tx.rawRowHashes)]
    );
    for (const row of misclassified.rows) {
      let historicalPrice: number | null = null;
      try { historicalPrice = await getHistoricalPriceEur(row.asset, new Date(row.timestamp)); } catch { /* ignorar */ }
      depositReviews.push({
        txKey: row.id, timestamp: new Date(row.timestamp).toISOString(), asset: row.asset,
        amount: parseFloat(row.amount), historicalPrice, existingInDb: true, kind: 'compra',
      });
    }
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
      kind: 'deposito',
    });
  }

  // Dirección, red y hash de cada retiro (#320): Bitvavo los trae; Binance, con su historial de retiradas.
  const { destinos, resumen } = await destinosDeRetiros(exchange, parseResult, retiradasBuffers);

  return {
    validation,
    // Marca explícita de las filas nuevas (#316): la revisión solo debe pedir las nuevas.
    transactions: parseResult.transactions.map(tx => {
      const destino = destinos.get(tx.rawRowHashes[0]);
      return { ...tx, isNew: !tx.rawRowHashes.some(h => existingHashes.has(h)), ...(destino ? { destino } : {}) };
    }),
    duplicateCount,
    newCount,
    errors: parseResult.errors.map((e) => e.message),
    unknownOperationSamples,
    depositReviews,
    retiradas: resumen,
    originalRowsMissing,
  };
}
