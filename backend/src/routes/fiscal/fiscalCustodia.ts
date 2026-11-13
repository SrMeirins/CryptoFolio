import { Router, Request, Response } from 'express';
import { z } from 'zod';
import {
  CustodiaError, guardarCustodia, listarCustodia, quitarFila, reglasPublicas, restablecerCustodia,
} from '../../modules/fiscal/custodia';
import { resetObligaciones721Cache } from '../../modules/fiscal/obligacion721';
import { sendInternalError } from '../../middleware/errorHandler';
import { sendZodError } from './fiscalShared';

// Custodia de las wallets de exchange para el Modelo 721 (#545). Cambiarla
// cambia qué computa, así que vacía la caché de la obligación del calendario.
const router = Router();

const texto = (max: number) => z.string().trim().max(max);
const opcional = (max: number) => texto(max).transform(v => (v === '' ? null : v)).nullable().optional()
  .transform(v => v ?? null);

/** Fecha de calendario AAAA-MM-DD real (no 2025-02-30) entre 2009 y 2100. */
const fechaSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha: AAAA-MM-DD').refine(v => {
  const d = new Date(`${v}T00:00:00Z`);
  const y = d.getUTCFullYear();
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v && y >= 2009 && y <= 2100;
}, 'Fecha no válida');

const entidadSchema = z.object({
  nombre: texto(120).min(1, 'El nombre es obligatorio'),
  nif: opcional(32),
  pais: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/, 'País: código de dos letras').nullable().optional().transform(v => v ?? null),
  web: opcional(200),
}).strict();

const custodiaSchema = z.object({
  // Sin fecha: desde siempre.
  desde: fechaSchema.nullable().optional().transform(v => v ?? null),
  enEspana: z.boolean(),
  entidad: entidadSchema.nullable().optional().transform(v => v ?? null),
}).strict().refine(d => !d.entidad?.pais || (d.entidad.pais === 'ES') === d.enEspana, {
  message: 'El país de la entidad no cuadra con dónde está la custodia', path: ['entidad', 'pais'],
});

const idSchema = z.string().uuid();

function enviarError(res: Response, e: unknown, ruta: string) {
  if (e instanceof CustodiaError) { res.status(e.status).json({ error: e.message }); return; }
  sendInternalError(res, e, ruta);
}

// GET /api/fiscal/custodia: cada wallet de exchange con su custodia de hoy y lo indicado por el usuario.
router.get('/custodia', async (_req: Request, res: Response) => {
  try { res.json({ wallets: await listarCustodia(), reglas: reglasPublicas() }); } catch (e) { enviarError(res, e, 'GET /api/fiscal/custodia'); }
});

// DELETE /api/fiscal/custodia/filas/:id: quita una fila (antes que /:walletId).
router.delete('/custodia/filas/:id', async (req: Request, res: Response) => {
  if (!idSchema.safeParse(req.params.id).success) return res.status(400).json({ error: 'Id inválido' });
  try {
    await quitarFila(req.params.id);
    resetObligaciones721Cache();
    res.json({ ok: true });
  } catch (e) { enviarError(res, e, 'DELETE /api/fiscal/custodia/filas/:id'); }
});

// PUT /api/fiscal/custodia/:walletId { desde?, enEspana, entidad? }
router.put('/custodia/:walletId', async (req: Request, res: Response) => {
  if (!idSchema.safeParse(req.params.walletId).success) return res.status(400).json({ error: 'Id de wallet inválido' });
  const p = custodiaSchema.safeParse(req.body ?? {});
  if (!p.success) return sendZodError(res, p.error);
  try {
    await guardarCustodia(req.params.walletId, p.data);
    resetObligaciones721Cache();
    res.json({ ok: true });
  } catch (e) { enviarError(res, e, 'PUT /api/fiscal/custodia/:walletId'); }
});

// DELETE /api/fiscal/custodia/:walletId: vuelve a lo automático (o a «no se sabe»).
router.delete('/custodia/:walletId', async (req: Request, res: Response) => {
  if (!idSchema.safeParse(req.params.walletId).success) return res.status(400).json({ error: 'Id de wallet inválido' });
  try {
    const quitadas = await restablecerCustodia(req.params.walletId);
    resetObligaciones721Cache();
    res.json({ ok: true, quitadas });
  } catch (e) { enviarError(res, e, 'DELETE /api/fiscal/custodia/:walletId'); }
});

export default router;
