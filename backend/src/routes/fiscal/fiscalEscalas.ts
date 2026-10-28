import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { db } from '../../db/client';
import { escalaDe, escalaOficial, tiposValidos } from '../../modules/fiscal/escalasAhorro';
import { sendZodError } from '../settings/settingsShared';

// Escalas del ahorro por ejercicio (#452): la oficial del año y los tipos
// cambiados a mano en Ajustes. Solo se editan los tipos, uno por tramo.
const router = Router();

const yearSchema = z.object({ year: z.coerce.number().int().min(2000).max(2100) });
const tiposSchema = z.object({ tipos: z.array(z.number()).min(1).max(10) });

/** Escala como la pinta el frontend: hasta (null en el último), tipo y tipo oficial. */
async function respuesta(year: number) {
  const escala = await escalaDe(db, year);
  const oficial = escalaOficial(year);
  return {
    ejercicio: year,
    personalizada: escala.personalizada,
    tramos: escala.limites.map((hasta, i) => ({
      hasta: Number.isFinite(hasta) ? hasta : null, tipo: escala.tipos[i], tipoOficial: oficial.tipos[i],
    })),
  };
}

// ── GET /api/fiscal/escalas/:year ──────────────────────────────────────────
router.get('/escalas/:year', async (req: Request, res: Response) => {
  const p = yearSchema.safeParse(req.params);
  if (!p.success) { sendZodError(res, p.error); return; }
  res.json(await respuesta(p.data.year));
});

// ── PUT /api/fiscal/escalas/:year ──────────────────────────────────────────
router.put('/escalas/:year', async (req: Request, res: Response) => {
  const p = yearSchema.safeParse(req.params);
  if (!p.success) { sendZodError(res, p.error); return; }
  const b = tiposSchema.safeParse(req.body);
  if (!b.success) { sendZodError(res, b.error); return; }
  const { year } = p.data;
  if (!tiposValidos(year, b.data.tipos)) {
    res.status(400).json({ error: `La escala de ${year} tiene ${escalaOficial(year).tipos.length} tramos: un tipo por tramo, mayor que 0 y hasta 100` });
    return;
  }
  await db.query(
    `INSERT INTO irpf_escalas (ejercicio, tipos) VALUES ($1, $2)
     ON CONFLICT (ejercicio) DO UPDATE SET tipos = EXCLUDED.tipos, updated_at = NOW()`,
    [year, b.data.tipos],
  );
  res.json(await respuesta(year));
});

// ── DELETE /api/fiscal/escalas/:year ───────────────────────────────────────
// Vuelve a la escala oficial del ejercicio.
router.delete('/escalas/:year', async (req: Request, res: Response) => {
  const p = yearSchema.safeParse(req.params);
  if (!p.success) { sendZodError(res, p.error); return; }
  await db.query('DELETE FROM irpf_escalas WHERE ejercicio = $1', [p.data.year]);
  res.json(await respuesta(p.data.year));
});

export default router;
