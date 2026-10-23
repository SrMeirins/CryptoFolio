import { Router, Request, Response } from 'express';
import { db } from '../../db/client';
import { restoreOriginal } from '../../modules/history/importEdits';
import { requestLivePriceResync } from '../../modules/prices/liveFeed';
import { respondWithFifoRecalc, sendZodError, transactionIdSchema } from './transactionsShared';

// ── POST /api/v1/transactions/:id/restaurar ───────────────────────────────
// Devuelve una importada editada a sus valores importados (#378) y recalcula
// el FIFO. 400 con un id inválido, 404 si no existe, 409 si no está editada.

const router = Router();

router.post('/:id/restaurar', async (req: Request, res: Response) => {
  const id = transactionIdSchema.safeParse(req.params.id);
  if (!id.success) { sendZodError(res, id.error); return; }
  const result = await db.transaction(client => restoreOriginal(client, id.data));
  if (result === 'no_encontrada') { res.status(404).json({ error: 'Transacción no encontrada' }); return; }
  if (result === 'no_editada') { res.status(409).json({ error: 'La transacción no tiene cambios que restaurar' }); return; }
  requestLivePriceResync();
  await respondWithFifoRecalc(res, 'POST /api/v1/transactions/:id/restaurar');
});

export default router;
