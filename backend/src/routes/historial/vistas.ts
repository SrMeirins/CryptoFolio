import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { pool } from '../../db/client';
import {
  createView, deleteView, readViews, updateView, viewFiltersSchema, viewNameSchema, ViewError,
} from '../../modules/history/savedViews';
import { sendZodError } from '../transactions/transactionsShared';

// ── /api/v1/historial/vistas ──────────────────────────────────────────────
// Vistas guardadas de filtros del Historial (#369). Errores: 400 (datos
// inválidos o límite), 404 (id inexistente) y 409 (nombre repetido, con el id
// de la vista existente para poder sustituirla).

const router = Router();

const createSchema = z.strictObject({
  nombre: viewNameSchema,
  predeterminada: z.boolean().default(false),
  filtros: viewFiltersSchema,
  sustituir: z.boolean().default(false),
});

const updateSchema = z.strictObject({
  nombre: viewNameSchema.optional(),
  predeterminada: z.boolean().optional(),
  filtros: viewFiltersSchema.optional(),
}).refine(v => Object.keys(v).length > 0, 'no hay nada que cambiar');

const idSchema = z.uuid('id de vista no válido');

function sendViewError(res: Response, err: unknown): boolean {
  if (!(err instanceof ViewError)) return false;
  res.status(err.status).json({ error: err.message, ...(err.conflictId ? { id: err.conflictId } : {}) });
  return true;
}

router.get('/', async (_req: Request, res: Response) => {
  res.json({ vistas: await readViews(pool) });
});

router.post('/', async (req: Request, res: Response) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) { sendZodError(res, parsed.error); return; }
  const client = await pool.connect();
  try {
    const { view, replaced } = await createView(client, parsed.data);
    res.status(replaced ? 200 : 201).json({ vista: view, sustituida: replaced });
  } catch (err) {
    if (!sendViewError(res, err)) throw err;
  } finally {
    client.release();
  }
});

router.put('/:id', async (req: Request, res: Response) => {
  const id = idSchema.safeParse(req.params.id);
  if (!id.success) { sendZodError(res, id.error); return; }
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) { sendZodError(res, parsed.error); return; }
  const client = await pool.connect();
  try {
    res.json({ vista: await updateView(client, id.data, parsed.data) });
  } catch (err) {
    if (!sendViewError(res, err)) throw err;
  } finally {
    client.release();
  }
});

router.delete('/:id', async (req: Request, res: Response) => {
  const id = idSchema.safeParse(req.params.id);
  if (!id.success) { sendZodError(res, id.error); return; }
  const client = await pool.connect();
  try {
    await deleteView(client, id.data);
    res.status(204).end();
  } catch (err) {
    if (!sendViewError(res, err)) throw err;
  } finally {
    client.release();
  }
});

export default router;
