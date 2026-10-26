import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { db } from '../../db/client';
import { MADRID_TZ } from '../../modules/fiscal/madridTime';
import { getTransactionDetail } from '../../modules/history/transactionDetail';
import { sendZodError } from './transactionsShared';

// ── GET /api/v1/transactions/:id/detalle ──────────────────────────────────
// Detalle con trazabilidad de una transacción del Historial (#373).

const router = Router();
// Zona de los años fiscales (la sustituirá #347).
const DETAIL_TZ = MADRID_TZ;
const idSchema = z.uuid('id de transacción no válido');

router.get('/:id/detalle', async (req: Request, res: Response) => {
  const id = idSchema.safeParse(req.params.id);
  if (!id.success) { sendZodError(res, id.error); return; }
  const detail = await getTransactionDetail(db, id.data, DETAIL_TZ);
  if (!detail) { res.status(404).json({ error: 'La transacción no existe' }); return; }
  res.json(detail);
});

export default router;
