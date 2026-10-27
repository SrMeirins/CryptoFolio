import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { db } from '../../db/client';
import { getAppTimezone } from '../../modules/time/appTimezone';
import { historyExportSchema } from '../../modules/history/listFilters';
import { getHistoryStats } from '../../modules/history/historyStats';
import { sendZodError } from '../transactions/transactionsShared';

/** Incluir la operativa de margen (#403): por defecto no, porque infla las cifras. */
const includeMarginSchema = z.enum(['true', 'false'], { error: 'incluir_margen debe ser true o false' }).default('false');

// ── GET /api/v1/historial/estadisticas ────────────────────────────────────
// Tarjetas, gráfico de actividad y rankings sobre lo filtrado (#376), con los
// mismos filtros que la lista (sin paginación), más incluir_margen (#403),
// que solo afecta al resumen. 400 si un filtro no es válido.

const router = Router();

router.get('/', async (req: Request, res: Response) => {
  const tz = await getAppTimezone(db);
  const { incluir_margen: margen, ...filters } = req.query;
  const include = includeMarginSchema.safeParse(margen);
  if (!include.success) { sendZodError(res, include.error); return; }
  const parsed = historyExportSchema.safeParse(filters);
  if (!parsed.success) { sendZodError(res, parsed.error); return; }
  res.json(await getHistoryStats(db, parsed.data, tz, new Date(), include.data === 'true'));
});

export default router;
