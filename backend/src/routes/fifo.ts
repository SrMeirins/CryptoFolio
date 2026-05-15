import { Router } from 'express';
import { runFifoEngine } from '../modules/fifo/engine';
import { loadAssetMetadata, prefetchHistoricalPrices } from '../modules/prices/binance';
import { db } from '../db/client';

const router = Router();

// POST /api/fifo/run — Ejecutar el motor FIFO completo
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

    console.log(`[FIFO] Necesito ${required.length} precios históricos únicos`);

    // 3. Precargar precios (respeta rate limit automáticamente)
    await prefetchHistoricalPrices(required);

    // 4. Ejecutar motor FIFO
    const result = await runFifoEngine();

    res.json({ success: true, ...result });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

// GET /api/fifo/summary — Resumen fiscal por año
router.get('/summary', async (_req, res) => {
  const result = await db.query('SELECT * FROM v_fiscal_year ORDER BY fiscal_year');
  res.json(result.rows);
});

// GET /api/fifo/lots — Lotes FIFO abiertos actualmente
router.get('/lots', async (_req, res) => {
  const result = await db.query(
    `SELECT asset, wallet, 
            SUM(quantity_remaining) AS quantity,
            SUM(cost_basis_eur) AS cost_basis_eur,
            AVG(price_per_unit_eur) AS avg_price_eur,
            MIN(opened_at) AS oldest_lot,
            COUNT(*) AS lot_count
     FROM fifo_lots
     WHERE is_closed = FALSE AND quantity_remaining > 0
     GROUP BY asset, wallet
     ORDER BY asset, wallet`
  );
  res.json(result.rows);
});

export default router;
