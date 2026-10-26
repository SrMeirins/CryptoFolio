import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { db } from '../../db/client';
import { coberturaActual } from '../../modules/csv/coberturaDb';

const router = Router();

// GET /api/imports/cobertura (#328): tramos, huecos, pendiente y actividad mensual por exchange.
router.get('/cobertura', async (_req: Request, res: Response) => {
  const { despues } = await coberturaActual();
  res.json(despues);
});

const FECHA = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'fecha en formato YYYY-MM-DD').refine(d => !isNaN(Date.parse(`${d}T00:00:00Z`)), 'fecha no válida');
const revisionSchema = z.object({
  exchange: z.enum(['binance', 'bitvavo']),
  tipo: z.enum(['hueco', 'pendiente']),
  desde: FECHA,
  hasta: FECHA,
}).refine(v => v.desde <= v.hasta, { error: 'desde no puede ser posterior a hasta', path: ['desde'] });

// POST /api/imports/cobertura/revisiones: «No operé en ese periodo».
router.post('/cobertura/revisiones', async (req: Request, res: Response) => {
  const v = revisionSchema.safeParse(req.body);
  if (!v.success) { res.status(400).json({ error: `Datos inválidos: ${v.error.issues.map(i => i.message).join('; ')}` }); return; }
  const { exchange, tipo, desde, hasta } = v.data;
  const r = await db.query(
    `INSERT INTO cobertura_revisiones (exchange, tipo, desde, hasta) VALUES ($1, $2, $3, $4) RETURNING id`,
    [exchange, tipo, desde, hasta],
  );
  res.status(201).json({ id: r.rows[0].id });
});

// DELETE /api/imports/cobertura/revisiones/:id: deshacer la marca.
router.delete('/cobertura/revisiones/:id', async (req: Request, res: Response) => {
  const id = z.uuid().safeParse(req.params.id);
  if (!id.success) { res.status(400).json({ error: 'Id de revisión inválido' }); return; }
  const r = await db.query(`DELETE FROM cobertura_revisiones WHERE id = $1 RETURNING id`, [id.data]);
  if (r.rows.length === 0) { res.status(404).json({ error: 'Revisión no encontrada' }); return; }
  res.json({ ok: true });
});

export default router;
