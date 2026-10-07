import { db } from '../../db/client';
import { Exchange, parseExchangeCsv } from './exchanges';
import { importCsvFile, ImportResult } from './importer';
import { runFifoEngine, FifoRunResult } from '../fifo/engine';
import { loadAssetMetadata, getHistoricalPriceEur } from '../prices/binance';
import { setCoinGeckoStatusCallback, prefetchHistoricalPrices as prefetchCoinGeckoHistoricalPrices } from '../prices/coingecko';

// Fases de negocio de POST /api/imports/confirm, extraídas de routes/imports.ts
// para que el router quede como transporte puro (SSE/CORS/multer). Cada fase
// recibe un emisor de progreso genérico (no atado a SSE) — el router le pasa
// una función que escribe al stream; cualquier otro consumidor (tests, una
// futura cola en background) puede pasar otra implementación.
export type ProgressEmitter = (phase: string, message: string, progress?: number, total?: number) => void;

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface DepositGateResult {
  blocked: boolean;
  missingCount: number;
}

// GATE 0: comprobar depósitos externos ANTES de importar nada — depósitos del
// CSV con needsCostReview que no están ya en DB ni tienen coste en este envío.
export async function checkPreImportDepositGate(
  exchange: Exchange,
  fileBuffer: Buffer,
  depositCostsRaw: Record<string, number | null>,
): Promise<DepositGateResult & { preparse: Awaited<ReturnType<typeof parseExchangeCsv>> }> {
  const preparse = await parseExchangeCsv(exchange, fileBuffer);
  const csvExternalDeposits = preparse.transactions.filter(tx => tx.needsCostReview);

  const csvDepHashes = csvExternalDeposits.map(tx => tx.rawRowHashes[0]).filter(Boolean);
  const alreadyInDbRes = csvDepHashes.length > 0
    ? await db.query('SELECT row_hash FROM raw_transactions WHERE row_hash = ANY($1)', [csvDepHashes])
    : { rows: [] };
  const alreadyInDbHashes = new Set(alreadyInDbRes.rows.map((r: { row_hash: string }) => r.row_hash));

  const missingNewDeposits = csvExternalDeposits.filter(tx => {
    const key = tx.rawRowHashes[0];
    return key && !alreadyInDbHashes.has(key) && !(key in depositCostsRaw);
  });

  const dbPendingRes = await db.query(
    `SELECT id::text FROM transactions
     WHERE notes LIKE '%Depósito de cripto externo%' AND price_per_unit IS NULL`
  );
  const dbPendingIds: string[] = dbPendingRes.rows.map((r: { id: string }) => r.id);
  const missingDbDeposits = dbPendingIds.filter(id => !(id in depositCostsRaw));

  const missingCount = missingNewDeposits.length + missingDbDeposits.length;
  return { blocked: missingCount > 0, missingCount, preparse };
}

// GATE posterior: antes de correr FIFO, ningún depósito externo debe quedar
// sin coste de adquisición asignado (puede haber cambiado tras la fase de import).
export async function checkPendingDepositGate(): Promise<DepositGateResult> {
  const pendingDepRes = await db.query(
    `SELECT COUNT(*) AS cnt FROM transactions
     WHERE notes LIKE '%Depósito de cripto externo%' AND price_per_unit IS NULL`
  );
  const missingCount = parseInt(pendingDepRes.rows[0].cnt);
  return { blocked: missingCount > 0, missingCount };
}

// Separa depositCosts en actualizaciones de transacciones ya existentes en DB
// (claves UUID) vs costes de depósitos nuevos que trae este CSV (claves hash).
// null = usuario marcó "desconocido" — cuenta como revisado, no se aplica.
export function splitDepositCosts(depositCostsRaw: Record<string, number | null>): {
  existingDepositUpdates: Array<{ id: string; pricePerUnit: number }>;
  newDepositCosts: Record<string, number>;
} {
  const existingDepositUpdates = Object.entries(depositCostsRaw)
    .filter(([key, val]) => UUID_REGEX.test(key) && val !== null)
    .map(([id, pricePerUnit]) => ({ id, pricePerUnit: pricePerUnit as number }));

  const newDepositCosts: Record<string, number> = Object.fromEntries(
    Object.entries(depositCostsRaw)
      .filter(([key, val]) => !UUID_REGEX.test(key) && val !== null)
      .map(([k, v]) => [k, v as number])
  );

  return { existingDepositUpdates, newDepositCosts };
}

export async function applyExistingDepositCostUpdates(
  updates: Array<{ id: string; pricePerUnit: number }>,
): Promise<void> {
  for (const { id, pricePerUnit } of updates) {
    const amtRes = await db.query('SELECT amount FROM transactions WHERE id = $1', [id]);
    if (amtRes.rows[0]) {
      const costAmount = parseFloat(amtRes.rows[0].amount) * pricePerUnit;
      await db.query(
        'UPDATE transactions SET price_per_unit = $1, cost_amount = $2, updated_at = NOW() WHERE id = $3',
        [pricePerUnit, costAmount, id]
      );
    }
  }
}

export async function importTransactionsPhase(
  fileBuffer: Buffer,
  filename: string,
  withdrawalDestinations: Record<string, string>,
  newDepositCosts: Record<string, number>,
  exchange: Exchange,
  emit: ProgressEmitter,
): Promise<ImportResult> {
  const IMPORT_REPORT_EVERY = 5;
  let lastImportReport = 0;

  const importResult = await importCsvFile(
    fileBuffer,
    filename,
    withdrawalDestinations,
    newDepositCosts,
    (done, total, asset, operation) => {
      if (done - lastImportReport >= IMPORT_REPORT_EVERY || done === total) {
        lastImportReport = done;
        const label = asset && operation ? `${asset} · ${operation}` : 'Procesando...';
        emit('importing', label, done, total);
      }
    },
    (message, progress, total) => {
      emit('importing', message, progress, total);
    },
    exchange
  );

  emit('importing', `✓ ${importResult.newTransactions} transacciones nuevas importadas (${importResult.duplicateRows} duplicadas ignoradas)`);
  if (importResult.errors.length > 0) {
    emit(
      'importing',
      `⚠ ${importResult.errors.length} fila(s) con operación desconocida excluidas del import — revisa manualmente: ` +
      importResult.errors.join(' | ')
    );
  }

  return importResult;
}

// FASE 2: detecta y precarga los precios históricos que faltan (Binance →
// CoinGecko fallback), en lotes con concurrencia acotada.
export async function fetchMissingHistoricalPrices(emit: ProgressEmitter): Promise<void> {
  emit('prices', 'Detectando precios históricos necesarios...');
  await loadAssetMetadata();

  const txRes = await db.query(
    `SELECT DISTINCT cost_asset AS symbol, DATE(timestamp) AS date
     FROM transactions
     WHERE cost_asset IS NOT NULL AND cost_asset NOT IN ('EUR')
       AND operation_type IN ('BUY', 'SELL')
     UNION
     SELECT DISTINCT fee_asset AS symbol, DATE(timestamp) AS date
     FROM transactions
     WHERE fee_asset IS NOT NULL AND fee_asset NOT IN ('EUR')
     ORDER BY date`
  );

  const required = txRes.rows.map((r: { symbol: string; date: string }) => ({
    symbol: r.symbol,
    date: new Date(r.date),
  }));

  // Deduplicar pares symbol|date y filtrar los ya cacheados — 1 sola query batch
  const uniquePairs = new Map<string, Date>();
  for (const { symbol, date } of required) {
    const key = `${symbol}|${date.toISOString().slice(0, 10)}`;
    if (!uniquePairs.has(key)) uniquePairs.set(key, date);
  }

  const pairList = [...uniquePairs.entries()].map(([key, date]) => ({
    symbol:  key.split('|')[0],
    dateStr: key.split('|')[1],
    date,
  }));

  let toFetchList: Array<{ symbol: string; date: Date }> = [];

  if (pairList.length > 0) {
    const symbols  = [...new Set(pairList.map(p => p.symbol))];
    const dateStrs = [...new Set(pairList.map(p => p.dateStr))];
    const cachedRes = await db.query(
      `SELECT asset, price_date::text AS price_date
       FROM price_cache
       WHERE asset = ANY($1) AND price_date::text = ANY($2)`,
      [symbols, dateStrs]
    );
    const cachedSet = new Set(
      cachedRes.rows.map((r: { asset: string; price_date: string }) => `${r.asset}|${r.price_date}`)
    );
    toFetchList = pairList.filter(p => !cachedSet.has(`${p.symbol}|${p.dateStr}`));
  }

  const toFetch = toFetchList.length;

  if (toFetch === 0) {
    emit('prices', '✓ Todos los precios históricos en caché');
    return;
  }

  emit('prices', `Cargando ${toFetch} precios históricos (Binance → CoinGecko fallback)...`, 0, toFetch);

  // Activar callback CoinGecko para que rate limits aparezcan en fase 'prices'
  setCoinGeckoStatusCallback((msg) => emit('prices', msg));

  try {
    // Pre-warm CoinGecko solo para activos que dependen de CoinGecko (no Binance).
    // BNB, USDT, DOGE, etc. tienen par Binance — van directo al bucle individual.
    // Solo activos con price_source='coingecko' (ej: LUNC) van aquí.
    // eur_direct / usdt_proxy / fiat ya tienen precio desde Binance — no necesitan CoinGecko.
    const allSymbols = [...new Set(toFetchList.map(p => p.symbol))];
    const geckoRes = await db.query(
      `SELECT symbol FROM asset_metadata
       WHERE symbol = ANY($1) AND coingecko_id IS NOT NULL
         AND price_source NOT IN ('eur_direct', 'usdt_proxy', 'fiat')`,
      [allSymbols]
    );
    const geckoSymbols = new Set(geckoRes.rows.map((r: { symbol: string }) => r.symbol));
    const geckoToFetch = toFetchList.filter(p => geckoSymbols.has(p.symbol));

    if (geckoToFetch.length > 0) {
      const geckoAssets = [...new Set(geckoToFetch.map(p => p.symbol))];
      emit('prices', `🔄 Pre-cargando CoinGecko para: ${geckoAssets.join(', ')} (${geckoToFetch.length} fecha${geckoToFetch.length !== 1 ? 's' : ''})...`);
      await prefetchCoinGeckoHistoricalPrices(geckoToFetch);

      // Re-evaluar qué queda sin caché tras el prefetch
      const warmCachedRes = await db.query(
        `SELECT asset, price_date::text AS price_date FROM price_cache
         WHERE asset = ANY($1) AND price_date::text = ANY($2)`,
        [geckoAssets, [...new Set(geckoToFetch.map(p => p.date.toISOString().slice(0, 10)))]]
      );
      const warmCachedSet = new Set(
        warmCachedRes.rows.map((r: { asset: string; price_date: string }) => `${r.asset}|${r.price_date}`)
      );
      toFetchList = toFetchList.filter(p =>
        !geckoSymbols.has(p.symbol) || !warmCachedSet.has(`${p.symbol}|${p.date.toISOString().slice(0, 10)}`)
      );
    }

    // Concurrencia 10: Binance no tiene rate limit; CoinGecko está serializado
    // por su cola interna (6.5s entre llamadas) independientemente de cuántas
    // llamadas concurrentes haya — el cuello de botella lo gestiona la cola.
    const CONCURRENCY = 10;
    let done = 0;
    for (let i = 0; i < toFetchList.length; i += CONCURRENCY) {
      const batch = toFetchList.slice(i, i + CONCURRENCY);
      await Promise.allSettled(
        batch.map(async ({ symbol, date }) => {
          const dateStr = date.toISOString().slice(0, 10);
          const price = await getHistoricalPriceEur(symbol, date).catch(() => 0);
          done++;
          const label = price > 0
            ? `✓ ${symbol} @ ${dateStr}`
            : `— ${symbol} @ ${dateStr} (sin precio)`;
          emit('prices', label, done, toFetchList.length);
        })
      );
    }
  } finally {
    setCoinGeckoStatusCallback(undefined);
  }
}

// FASE 3: ejecuta el motor FIFO y emite un resumen legible de resultado,
// agrupando advertencias repetidas para no saturar el log del cliente.
export async function runFifoPhase(emit: ProgressEmitter): Promise<FifoRunResult> {
  emit('fifo', 'Ejecutando motor FIFO...');
  const fifoResult = await runFifoEngine();
  emit('fifo', `✓ FIFO completado: ${fifoResult.lotsCreated} lotes, ${fifoResult.lotsConsumed} consumos`);

  if (fifoResult.errors.length > 0) {
    emit('fifo', `⚠ ${fifoResult.errors.length} advertencia${fifoResult.errors.length > 1 ? 's' : ''} FIFO:`);
    // Agrupar mensajes repetidos: "Sin lotes abiertos para USDT" × N
    const grouped = new Map<string, number>();
    for (const err of fifoResult.errors) {
      // Normalizar: quitar wallet_id UUID para agrupar mejor
      const key = err.replace(/\s+\([0-9a-f-]{36}\)/gi, '').replace(/wallet [0-9a-f-]{36}/gi, 'wallet');
      grouped.set(key, (grouped.get(key) ?? 0) + 1);
    }
    const MAX_GROUPS = 20;
    let shown = 0;
    for (const [msg, count] of [...grouped.entries()].sort((a, b) => b[1] - a[1])) {
      if (shown >= MAX_GROUPS) break;
      emit('fifo', count > 1 ? `  ⚠ ${msg} (×${count})` : `  ⚠ ${msg}`);
      shown++;
    }
    if (grouped.size > MAX_GROUPS) {
      emit('fifo', `  ... y ${grouped.size - MAX_GROUPS} tipos más de advertencias`);
    }
  }

  const netGP = fifoResult.totalGainEur + fifoResult.totalLossEur;
  emit('fifo', `G/P neto: ${netGP >= 0 ? '+' : ''}${netGP.toFixed(2)}€`);

  return fifoResult;
}
