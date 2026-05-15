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
    // FASE 1: Importar transacciones
    send('importing', 'Importando transacciones...');
    const importResult = await importCsvFile(req.file.buffer, req.file.originalname);
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

    // Filtrar los que ya están en caché
    let toFetch = 0;
    for (const { symbol, date } of required) {
      const cached = await db.query(
        'SELECT id FROM price_cache WHERE asset = $1 AND price_date = $2',
        [symbol, date.toISOString().slice(0, 10)]
      );
      if (cached.rows.length === 0) toFetch++;
    }

    if (toFetch > 0) {
      send('prices', `Cargando ${toFetch} precios históricos en paralelo...`, 0, toFetch);

      // Precarga con progreso
      const unique = new Map<string, Date>();
      for (const { symbol, date } of required) {
        const key = `${symbol}|${date.toISOString().slice(0, 10)}`;
        if (!unique.has(key)) unique.set(key, date);
      }

      const toFetchList: Array<{ symbol: string; date: Date }> = [];
      for (const [key, date] of unique) {
        const symbol = key.split('|')[0];
        const cached = await db.query(
          'SELECT id FROM price_cache WHERE asset = $1 AND price_date = $2',
          [symbol, date.toISOString().slice(0, 10)]
        );
        if (cached.rows.length === 0) toFetchList.push({ symbol, date });
      }

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

  // Recalcular FIFO automáticamente tras borrar
  // Solo si quedan imports (si no hay datos, no hay nada que calcular)
  const remaining = await db.query('SELECT COUNT(*) FROM csv_imports');
  if (parseInt(remaining.rows[0].count) > 0) {
    runFifoEngine().catch(err =>
      console.error('[DELETE IMPORT] Error recalculando FIFO:', err.message)
    );
  }

  res.json({ success: true, fifoRecalculating: parseInt(remaining.rows[0].count) > 0 });
});

export default router;
