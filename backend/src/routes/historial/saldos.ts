import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { db } from '../../db/client';
import { getRunningBalance } from '../../modules/history/runningBalance';
import { sendZodError } from '../transactions/transactionsShared';

// ── GET /api/v1/historial/saldos ──────────────────────────────────────────
// Saldo corrido de un activo (#380): saldo tras cada operación pedida (las
// filas de la página), saldo actual y déficits. 400 si los parámetros no son
// válidos.

const router = Router();

const MAX_IDS = 200;
const schema = z.object({
  asset: z.string().regex(/^[A-Za-z0-9._-]{1,32}$/, 'activo no válido').transform(v => v.toUpperCase()),
  wallet_id: z.string().uuid('debe ser un UUID válido').optional(),
  ids: z.string().optional()
    .transform(v => (v ? v.split(',').filter(Boolean) : []))
    .pipe(z.array(z.string().uuid('id de transacción no válido')).max(MAX_IDS, `como mucho ${MAX_IDS} ids`)),
  group_fees: z.enum(['true', 'false'], { message: 'debe ser true o false' }).transform(v => v === 'true').default('true'),
}).strict();

router.get('/', async (req: Request, res: Response) => {
  const parsed = schema.safeParse(req.query);
  if (!parsed.success) { sendZodError(res, parsed.error); return; }
  const q = parsed.data;
  res.json(await getRunningBalance(db, q.asset, q.wallet_id ?? null, q.ids, q.group_fees));
});

export default router;
