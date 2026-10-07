import { Router, Request, Response } from 'express';
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
  const currentYear = new Date().getFullYear();

  // Obtenemos neto G/P y rendimientos de los últimos 5 años
  const rows: { year: number; netoGP: number; rendimientos: number }[] = [];
  for (let y = currentYear - 4; y <= currentYear; y++) {
    const gpR = await db.query(`
      SELECT COALESCE(SUM(flc.gain_loss_eur), 0) AS neto
      FROM fifo_lot_consumptions flc
      WHERE EXTRACT(YEAR FROM flc.consumed_at) = $1
        AND flc.fiscal_event_type != 'NONE'
    `, [y]);
    const rendR = await db.query(`
      SELECT COALESCE(SUM(t.amount_net * COALESCE(t.price_per_unit, 0)), 0) AS total
      FROM transactions t
      WHERE EXTRACT(YEAR FROM t.timestamp) = $1
        AND t.operation_type IN ('STAKING_REWARD','MINING_REWARD','LENDING_INTEREST','LENDING_INTEREST_LOCKED','CASHBACK','AIRDROP')
    `, [y]);
    rows.push({
      year: y,
      netoGP:        parseFloat(gpR.rows[0]?.neto ?? '0'),
      rendimientos:  parseFloat(rendR.rows[0]?.total ?? '0'),
    });
  }

  // Simulamos la compensación año a año manteniendo un pool de pérdidas pendientes
  // con su año de origen (para respetar el límite de 4 años)
  type PendienteItem = { year: number; importe: number };
  let pendientes: PendienteItem[] = [];

  const resultado = rows.map(({ year, netoGP, rendimientos }) => {
    // Expirar pérdidas de hace más de 4 años
    pendientes = pendientes.filter(p => year - p.year <= 4);

    const perdidaEsteAnio  = netoGP < 0 ? Math.abs(netoGP) : 0;
    const gananciasPatrim  = netoGP > 0 ? netoGP : 0;

    // 1. Compensar pérdidas pendientes contra ganancias patrimoniales del año
    const pendienteTotalPatrim = pendientes.reduce((s, p) => s + p.importe, 0);
    const compensadoPatrim = Math.min(pendienteTotalPatrim, gananciasPatrim);
    const restanteGanancias = gananciasPatrim - compensadoPatrim;

    // Aplicar consumo proporcional FIFO sobre los pendientes
    let aConsumir = compensadoPatrim;
    for (const p of pendientes) {
      const consumido = Math.min(p.importe, aConsumir);
      p.importe -= consumido;
      aConsumir -= consumido;
      if (aConsumir <= 0) break;
    }
    pendientes = pendientes.filter(p => p.importe > 0.01);

    // 2. Compensar pérdidas pendientes restantes contra rendimientos (límite 25%)
    const limiteRendimientos = rendimientos > 0 ? rendimientos * 0.25 : 0;
    const pendienteTotalRend = pendientes.reduce((s, p) => s + p.importe, 0);
    const compensadoRend = Math.min(pendienteTotalRend, limiteRendimientos);

    aConsumir = compensadoRend;
    for (const p of pendientes) {
      const consumido = Math.min(p.importe, aConsumir);
      p.importe -= consumido;
      aConsumir -= consumido;
      if (aConsumir <= 0) break;
    }
    pendientes = pendientes.filter(p => p.importe > 0.01);

    // Acumular pérdida de este año
    if (perdidaEsteAnio > 0.01) {
      pendientes.push({ year, importe: perdidaEsteAnio });
    }

    return {
      year,
      netoAntes:          netoGP,
      rendimientos,
      perdida:            perdidaEsteAnio,
      compensadoPatrim,
      compensadoRend,
      compensado:         compensadoPatrim + compensadoRend,
      limiteRend25:       limiteRendimientos,
      netoDespues:        restanteGanancias,
    };
  });

  res.json({
    pendienteTotal: pendientes.reduce((s, p) => s + p.importe, 0),
    detalle: resultado,
  });
});

export default router;
