import { Router } from 'express';
import { db } from '../../db/client';
import { sendInternalError } from '../../middleware/errorHandler';
import { runFifoEngine } from '../../modules/fifo/engine';
import { loadAssetMetadata, prefetchHistoricalPrices } from '../../modules/prices/binance';

const router = Router();

// POST /api/fifo/run — Ejecutar el motor FIFO completo.
// runFifoEngine() serializa ejecuciones concurrentes con
// pg_advisory_xact_lock() dentro de su propia transacción (confirmado en
// fifo/engine.ts, preexistente) — no hay condición de carrera real que
// corregir aquí pese a la ausencia de lock explícito en este endpoint.
router.post('/run', async (_req, res) => {
  try {
    // 1. Asegurar metadata cargada
    await loadAssetMetadata();

    // 2. Detectar todos los precios históricos necesarios
    const txRes = await db.query(
      `SELECT DISTINCT cost_asset AS symbol, DATE(timestamp) AS date
       FROM transactions
       WHERE cost_asset IS NOT NULL
         AND cost_asset NOT IN ('EUR')
         AND operation_type IN ('BUY', 'SELL')
       UNION
       SELECT DISTINCT fee_asset AS symbol, DATE(timestamp) AS date
       FROM transactions
       WHERE fee_asset IS NOT NULL
         AND fee_asset NOT IN ('EUR')
       ORDER BY date`
    );

    const required = txRes.rows.map((r: { symbol: string; date: string }) => ({
      symbol: r.symbol,
      date: new Date(r.date),
    }));

    // 3. Precargar precios (respeta rate limit automáticamente)
    await prefetchHistoricalPrices(required);

    // 4. Ejecutar motor FIFO
    const result = await runFifoEngine();

    res.json({ success: true, ...result });
  } catch (e) {
    sendInternalError(res, e, 'POST /api/fifo/run');
  }
});

export default router;
