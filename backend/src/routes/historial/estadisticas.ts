import { Router, Request, Response } from 'express';
import { db } from '../../db/client';
import { MADRID_TZ } from '../../modules/fiscal/madridTime';
import { historyExportSchema } from '../../modules/history/listFilters';
import { getHistoryStats } from '../../modules/history/historyStats';
import { sendZodError } from '../transactions/transactionsShared';

// ── GET /api/v1/historial/estadisticas ────────────────────────────────────
// Tarjetas, gráfico de actividad y rankings sobre lo filtrado (#376), con los
// mismos filtros que la lista (sin paginación). 400 si un filtro no es válido.

const router = Router();

// Zona de los meses del gráfico y del cierre diario (la sustituirá #347).
const STATS_TZ = MADRID_TZ;

router.get('/', async (req: Request, res: Response) => {
  const parsed = historyExportSchema.safeParse(req.query);
  if (!parsed.success) { sendZodError(res, parsed.error); return; }
  res.json(await getHistoryStats(db, parsed.data, STATS_TZ));
});

export default router;
