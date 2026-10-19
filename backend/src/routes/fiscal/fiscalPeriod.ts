import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { db } from '../../db/client';
import { parseYear, sendZodError } from './fiscalShared';
import { clampDay } from '../../modules/fiscal/madridTime';

// Neto patrimonial de un ejercicio hasta una fecha (#297), para comparar el
// año en curso con el mismo periodo del anterior («2025 a estas alturas»).
// La fecha es un día de Madrid (MM-DD) y se incluye completo.
const router = Router();

const querySchema = z.object({
  hasta: z.string().regex(/^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/, 'formato MM-DD'),
}).strict();

// GET /api/fiscal/:year/neto-hasta?hasta=MM-DD
router.get('/:year/neto-hasta', async (req: Request, res: Response) => {
  const year = parseYear(req.params.year);
  if (!year) return res.status(400).json({ error: 'Año inválido' });
  const parsed = querySchema.safeParse(req.query);
  if (!parsed.success) return sendZodError(res, parsed.error);

  const [month, rawDay] = parsed.data.hasta.split('-').map(Number);
  const day = clampDay(year, month, rawDay);
  const hasta = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

  const r = await db.query(`
    SELECT
      COALESCE(SUM(CASE WHEN flc.gain_loss_eur > 0 THEN flc.gain_loss_eur ELSE 0 END), 0) AS ganancias,
      COALESCE(SUM(CASE WHEN flc.gain_loss_eur < 0 THEN flc.gain_loss_eur ELSE 0 END), 0) AS perdidas,
      COALESCE(SUM(flc.gain_loss_eur), 0) AS neto,
      COUNT(*) AS operaciones
    FROM fifo_lot_consumptions flc
    WHERE EXTRACT(YEAR FROM flc.consumed_at AT TIME ZONE 'Europe/Madrid') = $1
      AND (flc.consumed_at AT TIME ZONE 'Europe/Madrid')::date <= $2::date
      AND flc.fiscal_event_type != 'NONE'
  `, [year, hasta]);

  res.json({
    year,
    hasta,
    ganancias:   parseFloat(r.rows[0].ganancias),
    perdidas:    parseFloat(r.rows[0].perdidas),
    neto:        parseFloat(r.rows[0].neto),
    operaciones: parseInt(r.rows[0].operaciones, 10),
  });
});

export default router;
