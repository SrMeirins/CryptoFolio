import { Router, Request, Response } from 'express';
import multer from 'multer';
import { importCsvFile, previewCsvFile } from '../modules/csv/importer';
import { runFifoEngine } from '../modules/fifo/engine';
import { loadAssetMetadata, prefetchHistoricalPrices } from '../modules/prices/binance';
import { db } from '../db/client';


const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!file.originalname.endsWith('.csv')) {
      cb(new Error('Solo se aceptan archivos CSV'));
      return;
    }
    cb(null, true);
  },
});

// POST /api/imports/preview
router.post('/preview', upload.single('file'), async (req: Request, res: Response) => {
  if (!req.file) { res.status(400).json({ error: 'No se recibió ningún archivo' }); return; }
  try {
    const result = await previewCsvFile(req.file.buffer);
    res.json(result);
  } catch (err) {
    res.status(422).json({ error: (err as Error).message });
  }
});

// POST /api/imports/confirm — Import + FIFO con SSE
router.post('/confirm', upload.single('file'), async (req: Request, res: Response) => {
  if (!req.file) { res.status(400).json({ error: 'No se recibió ningún archivo' }); return; }

  // Configurar SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');

  function send(phase: string, message: string, progress?: number, total?: number) {
    const data = JSON.stringify({ phase, message, progress, total });
    res.write(`data: ${data}\n\n`);
  }

  try {
    const withdrawalDestinations: Record<string, string> = req.body.withdrawalDestinations
      ? JSON.parse(req.body.withdrawalDestinations as string)
      : {};
    // null = usuario marcó "desconocido" — cuenta como revisado (no bloquea el import)
    const depositCostsRaw: Record<string, number | null> = req.body.depositCosts
      ? JSON.parse(req.body.depositCosts as string)
      : {};

    // ── GATE 0: comprobar depósitos externos ANTES de importar nada ──────────
    // 1. Depósitos en el CSV con needsCostReview
    const { parseBinanceCsv } = await import('../modules/csv/parser');
    const preparse = parseBinanceCsv(req.file.buffer);
    const csvExternalDeposits = preparse.transactions.filter(tx => tx.needsCostReview);

    // ¿Cuáles de ellos son YA duplicados (ya en DB)?
    const csvDepHashes = csvExternalDeposits.map(tx => tx.rawRowHashes[0]).filter(Boolean);
    const alreadyInDbRes = csvDepHashes.length > 0
      ? await db.query('SELECT row_hash FROM raw_transactions WHERE row_hash = ANY($1)', [csvDepHashes])
      : { rows: [] };
    const alreadyInDbHashes = new Set(alreadyInDbRes.rows.map((r: { row_hash: string }) => r.row_hash));

    // Depósitos NUEVOS (no están aún en DB) sin coste asignado en este envío
    const missingNewDeposits = csvExternalDeposits.filter(tx => {
      const key = tx.rawRowHashes[0];
      return key && !alreadyInDbHashes.has(key) && !(key in depositCostsRaw);
    });

    // 2. Depósitos ya en DB sin coste (independientemente del CSV actual)
    const dbPendingRes = await db.query(
      `SELECT id::text FROM transactions
       WHERE notes LIKE '%Depósito de cripto externo%' AND price_per_unit IS NULL`
    );
    const dbPendingIds: string[] = dbPendingRes.rows.map((r: { id: string }) => r.id);
    const missingDbDeposits = dbPendingIds.filter(id => !(id in depositCostsRaw));

    const totalMissing = missingNewDeposits.length + missingDbDeposits.length;
    if (totalMissing > 0) {
      send('error',
        `⛔ Revisión requerida: hay ${totalMissing} depósito${totalMissing > 1 ? 's' : ''} ` +
        `externo${totalMissing > 1 ? 's' : ''} sin coste de adquisición. ` +
        `Vuelve al preview y asigna el coste en el panel de "Revisión obligatoria".`
      );
      res.end();
      return;
    }

    // ── FASE 1: Importar transacciones ────────────────────────────────────────
    send('importing', 'Importando transacciones...');

    // Separar costes: UUIDs (ya en DB) vs hashes (nuevos en CSV)
    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    // Solo actualizar los que tienen precio real (null = desconocido, no actualizar)
    const existingDepositUpdates = Object.entries(depositCostsRaw)
      .filter(([key, val]) => UUID_REGEX.test(key) && val !== null)
      .map(([id, pricePerUnit]) => ({ id, pricePerUnit: pricePerUnit as number }));
    // Solo nuevos depósitos con precio real (null = desconocido)
    const newDepositCosts: Record<string, number> = Object.fromEntries(
      Object.entries(depositCostsRaw)
        .filter(([key, val]) => !UUID_REGEX.test(key) && val !== null)
        .map(([k, v]) => [k, v as number])
    );

    if (existingDepositUpdates.length > 0) {
      for (const { id, pricePerUnit } of existingDepositUpdates) {
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

    const importResult = await importCsvFile(req.file.buffer, req.file.originalname, withdrawalDestinations, newDepositCosts);
    send('importing', `✓ ${importResult.newTransactions} transacciones nuevas importadas (${importResult.duplicateRows} duplicadas ignoradas)`);

    // FASE 2: Precios históricos
    send('prices', 'Detectando precios históricos necesarios...');
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

    if (toFetch > 0) {
      send('prices', `Cargando ${toFetch} precios históricos en paralelo...`, 0, toFetch);

      const CONCURRENCY = 10;
      let done = 0;
      for (let i = 0; i < toFetchList.length; i += CONCURRENCY) {
        const batch = toFetchList.slice(i, i + CONCURRENCY);
        await Promise.allSettled(
          batch.map(async ({ symbol, date }) => {
            const { getHistoricalPriceEur } = await import('../modules/prices/binance');
            await getHistoricalPriceEur(symbol, date).catch(() => {});
            done++;
            send('prices', `Precios: ${done}/${toFetchList.length}`, done, toFetchList.length);
          })
        );
      }
    } else {
      send('prices', '✓ Todos los precios históricos en caché');
    }

    // GATE: verificar que no haya depósitos externos sin coste antes de correr FIFO
    const pendingDepRes = await db.query(
      `SELECT COUNT(*) AS cnt FROM transactions
       WHERE notes LIKE '%Depósito de cripto externo%' AND price_per_unit IS NULL`
    );
    const pendingDepCount = parseInt(pendingDepRes.rows[0].cnt);
    if (pendingDepCount > 0) {
      send('error',
        `⛔ FIFO bloqueado: hay ${pendingDepCount} depósito${pendingDepCount > 1 ? 's' : ''} ` +
        `externo${pendingDepCount > 1 ? 's' : ''} sin coste de adquisición. ` +
        `Revísalos en la sección de Importación antes de continuar.`
      );
      res.end();
      return;
    }

    // FASE 3: Motor FIFO
    send('fifo', 'Ejecutando motor FIFO...');
    const fifoResult = await runFifoEngine();
    send('fifo', `✓ FIFO completado: ${fifoResult.lotsCreated} lotes, ${fifoResult.lotsConsumed} consumos`);

    if (fifoResult.errors.length > 0) {
      send('fifo', `⚠ ${fifoResult.errors.length} advertencias en el cálculo FIFO`);
    }

    const netGP = fifoResult.totalGainEur + fifoResult.totalLossEur;
    send('fifo', `G/P neto: ${netGP >= 0 ? '+' : ''}${netGP.toFixed(2)}€`);

    // DONE
    send('done', 'Proceso completado correctamente');

  } catch (err) {
    send('error', `Error: ${(err as Error).message}`);
  } finally {
    res.end();
  }
});

// POST /api/imports
router.post('/', upload.single('file'), async (req: Request, res: Response) => {
  if (!req.file) { res.status(400).json({ error: 'No se recibió ningún archivo' }); return; }
  try {
    const result = await importCsvFile(req.file.buffer, req.file.originalname);
    res.status(201).json({ success: true, ...result });
  } catch (err) {
    const message = (err as Error).message;
    if (message.includes('ya fue importado')) { res.status(409).json({ error: message }); return; }
    res.status(422).json({ error: message });
  }
});

// GET /api/imports
router.get('/', async (_req: Request, res: Response) => {
  const result = await db.query(
    `SELECT
       ci.id,
       ci.filename,
       ci.imported_at,
       ci.row_count,
       ci.skipped_count,
       COUNT(t.id) AS transaction_count,
       MIN(t.timestamp) AS date_from,
       MAX(t.timestamp) AS date_to,
       COUNT(CASE WHEN t.operation_type = 'BUY' THEN 1 END) AS buy_count,
       COUNT(CASE WHEN t.operation_type = 'SELL' THEN 1 END) AS sell_count,
       COUNT(CASE WHEN t.operation_type = 'WITHDRAW' THEN 1 END) AS withdraw_count,
       COUNT(CASE WHEN t.operation_type = 'DEPOSIT_FIAT' THEN 1 END) AS deposit_count
     FROM csv_imports ci
     LEFT JOIN transactions t ON t.import_id = ci.id
     GROUP BY ci.id
     ORDER BY ci.imported_at DESC`
  );
  res.json(result.rows);
});

// DELETE /api/imports/:id
router.delete('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;

  await db.transaction(async (client) => {
    const txRes = await client.query(
      'SELECT id FROM transactions WHERE import_id = $1', [id]
    );
    const txIds = txRes.rows.map((r: { id: string }) => r.id);

    if (txIds.length > 0) {
      await client.query(
        `DELETE FROM fifo_lot_consumptions
         WHERE consuming_transaction_id = ANY($1::uuid[])
            OR lot_id IN (
              SELECT id FROM fifo_lots WHERE open_transaction_id = ANY($1::uuid[])
            )`,
        [txIds]
      );
      await client.query(
        'DELETE FROM fifo_lots WHERE open_transaction_id = ANY($1::uuid[])',
        [txIds]
      );
    }

    await client.query('DELETE FROM raw_transactions WHERE import_id = $1', [id]);
    await client.query('DELETE FROM transactions WHERE import_id = $1', [id]);
    await client.query('DELETE FROM csv_imports WHERE id = $1', [id]);
  });

  // Recalcular FIFO y esperar resultado antes de responder
  const remaining = await db.query('SELECT COUNT(*) FROM csv_imports');
  if (parseInt(remaining.rows[0].count) > 0) {
    await runFifoEngine().catch(() => {});
  }

  res.json({ success: true });
});

export default router;
