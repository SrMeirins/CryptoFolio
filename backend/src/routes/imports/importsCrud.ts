import { Router, Request, Response } from 'express';
import { importCsvFile } from '../../modules/csv/importer';
import { Exchange, isExchange } from '../../modules/csv/exchanges';
import { runFifoEngine } from '../../modules/fifo/engine';
import { db } from '../../db/client';
import { upload } from './importsValidation';

const router = Router();

// POST /api/imports — import directo sin SSE (usado por integraciones/scripts,
// no por la UI principal que usa /confirm). Mismo criterio de mensajes de
// error intencionados que /preview — ver comentario en importsPreview.ts.
router.post('/', upload.single('file'), async (req: Request, res: Response) => {
  if (!req.file) { res.status(400).json({ error: 'No se recibió ningún archivo' }); return; }
  const exchange: Exchange = isExchange(req.body.exchange) ? req.body.exchange : 'binance';
  try {
    const result = await importCsvFile(req.file.buffer, req.file.originalname, {}, {}, undefined, undefined, exchange);
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
       ci.exchange,
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

  // Recalcular FIFO y esperar resultado antes de responder. Si falla, no se traga el
  // error: express-async-errors lo propaga al handler global y el DELETE no responde
  // "success" sobre un recálculo que en realidad no se completó.
  const remaining = await db.query('SELECT COUNT(*) FROM csv_imports');
  if (parseInt(remaining.rows[0].count) > 0) {
    await runFifoEngine();
  }

  res.json({ success: true });
});

export default router;
