import { Router } from 'express';
import { db } from '../../db/client';
import { sendInternalError } from '../../middleware/errorHandler';
import { runFifoEngine } from '../../modules/fifo/engine';
import { loadAssetMetadata, prefetchHistoricalPrices } from '../../modules/prices/binance';
import { fifoSummary, summaryDiff } from '../../modules/fifo/fifoSummary';

const router = Router();

// POST /api/fifo/run — Ejecutar el motor FIFO completo.
// runFifoEngine() serializa ejecuciones concurrentes con
// pg_advisory_xact_lock() dentro de su propia transacción (confirmado en
// fifo/engine.ts, preexistente) — no hay condición de carrera real que
// corregir aquí pese a la ausencia de lock explícito en este endpoint.
// Precios históricos que necesita el motor, precargados antes de ejecutarlo
// (respeta el límite de peticiones automáticamente).
async function prefetchRequiredPrices(): Promise<void> {
  await loadAssetMetadata();
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
  await prefetchHistoricalPrices(txRes.rows.map((r: { symbol: string; date: string }) => ({ symbol: r.symbol, date: new Date(r.date) })));
}

router.post('/run', async (_req, res) => {
  try {
    await prefetchRequiredPrices();
    const result = await runFifoEngine();
    res.json({ success: true, ...result });
  } catch (e) {
    sendInternalError(res, e, 'POST /api/fifo/run');
  }
});

// POST /api/fifo/run/stream (#454): lo mismo, con el avance en SSE y, al
// acabar, el resumen antes y después (lotes, consumos, faltantes, plusvalía).
router.post('/run/stream', async (_req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
  const flushable = res as typeof res & { flush?: () => void };
  const send = (event: Record<string, unknown>) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
    flushable.flush?.();
  };
  // Mantiene viva la conexión mientras se esperan precios (ver importsConfirm.ts).
  const heartbeat = setInterval(() => {
    try { res.write(': keepalive\n\n'); flushable.flush?.(); } catch { /* conexión ya cerrada */ }
  }, 10000);
  try {
    const before = await fifoSummary(db);
    send({ phase: 'precios' });
    await prefetchRequiredPrices();
    // Como mucho un evento por cada 1 % del total, para no saturar el stream.
    let last = -1;
    const result = await runFifoEngine((done, total) => {
      const pct = total ? Math.floor((done / total) * 100) : 100;
      if (pct !== last || done === total) { last = pct; send({ phase: 'fifo', done, total }); }
    });
    const after = await fifoSummary(db);
    send({
      phase: 'done', before, after, diff: summaryDiff(before, after),
      errors: result.errors.length, warnings: result.warnings.length,
    });
  } catch (e) {
    console.error('[fifo/run/stream]', (e as Error).message);
    send({ phase: 'error', message: 'No se pudo recalcular el FIFO' });
  } finally {
    clearInterval(heartbeat);
    res.end();
  }
});

export default router;
