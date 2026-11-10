import { Router, Request, Response } from 'express';
import { baseAhorro, cargarAniosFiscales, compensarPerdidas } from '../../modules/fiscal/carryforward';
import { calcularIrpfAhorro } from '../../modules/fiscal/irpf';
import { escalaDe } from '../../modules/fiscal/escalasAhorro';
import { db } from '../../db/client';
import { localYearMonth } from '../../modules/time/localTime';
import { getAppTimezone } from '../../modules/time/appTimezone';
import { OPS_RCM_AHORRO, OPS_RENTA_ESPECIE } from '../../modules/fiscal/clasificacionRentas';


const router = Router();

// ── GET /api/fiscal/years ──────────────────────────────────────────────────
router.get('/years', async (_req: Request, res: Response) => {
  const tz = await getAppTimezone(db);
  const result = await db.query(`
    SELECT DISTINCT EXTRACT(YEAR FROM consumed_at AT TIME ZONE $1)::int AS year
    FROM fifo_lot_consumptions
    UNION
    SELECT DISTINCT EXTRACT(YEAR FROM timestamp AT TIME ZONE $1)::int AS year
    FROM transactions
    WHERE operation_type = ANY($2)
    ORDER BY year DESC
  `, [tz, OPS_RENTA_ESPECIE]);
  res.json(result.rows.map((r: { year: number }) => r.year));
});

// ── GET /api/fiscal/overview ───────────────────────────────────────────────
// Devuelve resumen de todos los años disponibles en una sola llamada.
// Usado para la comparativa interanual y el carryforward de pérdidas.
router.get('/overview', async (_req: Request, res: Response) => {
  const tz = await getAppTimezone(db);
  const yearsRes = await db.query(`
    SELECT DISTINCT EXTRACT(YEAR FROM consumed_at AT TIME ZONE $1)::int AS year
    FROM fifo_lot_consumptions
    UNION
    SELECT DISTINCT EXTRACT(YEAR FROM timestamp AT TIME ZONE $1)::int AS year
    FROM transactions
    WHERE operation_type = ANY($2)
    ORDER BY year ASC
  `, [tz, OPS_RENTA_ESPECIE]);

  const years: number[] = yearsRes.rows.map((r: { year: number }) => r.year);

  const data = await Promise.all(years.map(async (year) => {
    const gpRes = await db.query(`
      SELECT
        COALESCE(SUM(CASE WHEN flc.gain_loss_eur > 0 THEN flc.gain_loss_eur ELSE 0 END), 0) AS total_ganancias,
        COALESCE(SUM(CASE WHEN flc.gain_loss_eur < 0 THEN flc.gain_loss_eur ELSE 0 END), 0) AS total_perdidas,
        COALESCE(SUM(flc.gain_loss_eur), 0) AS neto,
        COUNT(*) AS num_operaciones
      FROM fifo_lot_consumptions flc
      WHERE EXTRACT(YEAR FROM flc.consumed_at AT TIME ZONE $2) = $1
        AND flc.fiscal_event_type != 'NONE'
    `, [year, tz]);

    const rendRes = await db.query(`
      SELECT COALESCE(SUM(t.amount_net * COALESCE(t.price_per_unit, 0)), 0) AS total_rendimientos
      FROM transactions t
      WHERE EXTRACT(YEAR FROM t.timestamp AT TIME ZONE $2) = $1
        AND t.operation_type = ANY($3)
    `, [year, tz, OPS_RCM_AHORRO]);

    return {
      year,
      esAnioEnCurso: year === localYearMonth(tz).year,
      totalGanancias:  parseFloat(gpRes.rows[0]?.total_ganancias ?? '0'),
      totalPerdidas:   parseFloat(gpRes.rows[0]?.total_perdidas ?? '0'),
      netoPatrimonial: parseFloat(gpRes.rows[0]?.neto ?? '0'),
      numOperaciones:  parseInt(gpRes.rows[0]?.num_operaciones ?? '0'),
      totalRendimientos: parseFloat(rendRes.rows[0]?.total_rendimientos ?? '0'),
    };
  }));

  // Cuota estimada de cada año (#539): base del ahorro tras compensar, con la
  // escala de ese ejercicio; la misma regla que Fiscal y la Renta declarada.
  const { detalle } = compensarPerdidas(await cargarAniosFiscales(localYearMonth(tz).year));
  const conCuota = await Promise.all(data.map(async (o) => {
    const d = detalle.find(x => x.year === o.year);
    const base = Math.max(0, d ? baseAhorro(d) : o.netoPatrimonial + o.totalRendimientos);
    return { ...o, base, cuota: calcularIrpfAhorro(base, await escalaDe(db, o.year)) };
  }));

  res.json(conCuota);
});

// ── GET /api/fiscal/carryforward ───────────────────────────────────────────
// Análisis de compensación de pérdidas (últimos 4 años + año actual).
// Normativa española: pérdidas patrimoniales compensan contra ganancias
// patrimoniales sin límite, y contra rendimientos del capital mobiliario
// con límite del 25% de los rendimientos positivos del año, conjunto con la
// pérdida del propio año (art. 49 LIRPF, #537).
router.get('/carryforward', async (_req: Request, res: Response) => {
  const tz = await getAppTimezone(db);
  const rows = await cargarAniosFiscales(localYearMonth(tz).year);
  res.json(compensarPerdidas(rows));
});

export default router;
