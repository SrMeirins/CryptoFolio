import { Router, Request, Response } from 'express';
import { cargarAniosFiscales, compensarPerdidas } from '../../modules/fiscal/carryforward';
import { db } from '../../db/client';

const router = Router();

// ── GET /api/fiscal/years ──────────────────────────────────────────────────
router.get('/years', async (_req: Request, res: Response) => {
  const result = await db.query(`
    SELECT DISTINCT EXTRACT(YEAR FROM consumed_at)::int AS year
    FROM fifo_lot_consumptions
    UNION
    SELECT DISTINCT EXTRACT(YEAR FROM timestamp)::int AS year
    FROM transactions
    WHERE operation_type IN ('STAKING_REWARD','MINING_REWARD','LENDING_INTEREST','LENDING_INTEREST_LOCKED','CASHBACK','AIRDROP')
    ORDER BY year DESC
  `);
  res.json(result.rows.map((r: { year: number }) => r.year));
});

// ── GET /api/fiscal/overview ───────────────────────────────────────────────
// Devuelve resumen de todos los años disponibles en una sola llamada.
// Usado para la comparativa interanual y el carryforward de pérdidas.
router.get('/overview', async (_req: Request, res: Response) => {
  const yearsRes = await db.query(`
    SELECT DISTINCT EXTRACT(YEAR FROM consumed_at)::int AS year
    FROM fifo_lot_consumptions
    UNION
    SELECT DISTINCT EXTRACT(YEAR FROM timestamp)::int AS year
    FROM transactions
    WHERE operation_type IN ('STAKING_REWARD','MINING_REWARD','LENDING_INTEREST','LENDING_INTEREST_LOCKED','CASHBACK','AIRDROP')
    ORDER BY year ASC
  `);

  const years: number[] = yearsRes.rows.map((r: { year: number }) => r.year);

  const data = await Promise.all(years.map(async (year) => {
    const gpRes = await db.query(`
      SELECT
        COALESCE(SUM(CASE WHEN flc.gain_loss_eur > 0 THEN flc.gain_loss_eur ELSE 0 END), 0) AS total_ganancias,
        COALESCE(SUM(CASE WHEN flc.gain_loss_eur < 0 THEN flc.gain_loss_eur ELSE 0 END), 0) AS total_perdidas,
        COALESCE(SUM(flc.gain_loss_eur), 0) AS neto,
        COUNT(*) AS num_operaciones
      FROM fifo_lot_consumptions flc
      WHERE EXTRACT(YEAR FROM flc.consumed_at) = $1
        AND flc.fiscal_event_type != 'NONE'
    `, [year]);

    const rendRes = await db.query(`
      SELECT COALESCE(SUM(t.amount_net * COALESCE(t.price_per_unit, 0)), 0) AS total_rendimientos
      FROM transactions t
      WHERE EXTRACT(YEAR FROM t.timestamp) = $1
        AND t.operation_type IN ('STAKING_REWARD','MINING_REWARD','LENDING_INTEREST','LENDING_INTEREST_LOCKED','CASHBACK','AIRDROP')
    `, [year]);

    return {
      year,
      esAnioEnCurso: year === new Date().getFullYear(),
      totalGanancias:  parseFloat(gpRes.rows[0]?.total_ganancias ?? '0'),
      totalPerdidas:   parseFloat(gpRes.rows[0]?.total_perdidas ?? '0'),
      netoPatrimonial: parseFloat(gpRes.rows[0]?.neto ?? '0'),
      numOperaciones:  parseInt(gpRes.rows[0]?.num_operaciones ?? '0'),
      totalRendimientos: parseFloat(rendRes.rows[0]?.total_rendimientos ?? '0'),
    };
  }));

  res.json(data);
});

// ── GET /api/fiscal/carryforward ───────────────────────────────────────────
// Análisis de compensación de pérdidas (últimos 4 años + año actual).
// Normativa española: pérdidas patrimoniales compensan contra ganancias
// patrimoniales sin límite, y contra rendimientos del capital mobiliario
// con límite del 25% de los rendimientos positivos del año.
router.get('/carryforward', async (_req: Request, res: Response) => {
  const rows = await cargarAniosFiscales(new Date().getFullYear());
  res.json(compensarPerdidas(rows));
});

export default router;
