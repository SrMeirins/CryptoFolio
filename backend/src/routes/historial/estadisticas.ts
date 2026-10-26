import { Router, Request, Response } from 'express';
import { db } from '../../db/client';
import { getAppTimezone } from '../../modules/time/appTimezone';
import { historyExportSchema } from '../../modules/history/listFilters';
import { getHistoryStats } from '../../modules/history/historyStats';
import { sendZodError } from '../transactions/transactionsShared';

// ── GET /api/v1/historial/estadisticas ────────────────────────────────────
// Tarjetas, gráfico de actividad y rankings sobre lo filtrado (#376), con los
// mismos filtros que la lista (sin paginación). 400 si un filtro no es válido.

const router = Router();

router.get('/', async (req: Request, res: Response) => {
  const tz = await getAppTimezone(db);
  const parsed = historyExportSchema.safeParse(req.query);
  if (!parsed.success) { sendZodError(res, parsed.error); return; }
  res.json(await getHistoryStats(db, parsed.data, tz));
});

export default router;
