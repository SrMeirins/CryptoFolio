import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { db } from '../../db/client';
import { cargarAniosFiscales } from '../../modules/fiscal/carryforward';
import { escalaDe } from '../../modules/fiscal/escalasAhorro';
import { simularPlan } from '../../modules/fiscal/planVentas';
import {
  comprasRecientesReales, getComisionPlan, guardarPlan, leerPlan, lotesDePlan, MAX_VENTAS_PLAN, planesArchivados, vaciarPlan,
} from '../../modules/fiscal/planRepo';
import { sendInternalError } from '../../middleware/errorHandler';
import { localYearMonth } from '../../modules/time/localTime';
import { getAppTimezone } from '../../modules/time/appTimezone';
import { sendZodError } from './fiscalShared';

// Plan de ventas de fin de año (#546): el plan guardado del ejercicio en
// curso (uno por ejercicio) y la simulación de su efecto conjunto con el FIFO
// global y la cuota del año. Simular no escribe nada.
const router = Router();

const asset = z.string().trim().toUpperCase().regex(/^[A-Z0-9]{1,20}$/, 'Símbolo inválido');
const cantidad = z.number().positive('La cantidad tiene que ser mayor que 0').max(1e15);
const precio = z.number().positive('El precio tiene que ser mayor que 0').max(1e12);

const guardarSchema = z.object({
  ventas: z.array(z.object({ asset, walletId: z.uuid('walletId inválido'), cantidad, precioEur: precio.nullable() }).strict())
    .max(MAX_VENTAS_PLAN, `Como máximo ${MAX_VENTAS_PLAN} ventas`),
}).strict();

const simularSchema = z.object({
  ventas: z.array(z.object({ asset, walletId: z.uuid('walletId inválido'), cantidad, precioEur: precio }).strict())
    .min(1, 'El plan no tiene ventas').max(MAX_VENTAS_PLAN, `Como máximo ${MAX_VENTAS_PLAN} ventas`),
  comisionPct: z.number().min(0).max(10, 'La comisión va de 0 a 10 %'),
}).strict();

const ejercicioActual = async () => localYearMonth(await getAppTimezone(db)).year;

const ejercicioQuery = z.coerce.number().int().min(2009).max(2100).optional();

// GET /api/fiscal/plan[?ejercicio=AAAA]: el plan del ejercicio (por defecto, el
// actual, que es el editable), la comisión estimada y los planes archivados.
router.get('/plan', async (req: Request, res: Response) => {
  const q = ejercicioQuery.safeParse(req.query.ejercicio);
  if (!q.success) return res.status(400).json({ error: 'Ejercicio inválido' });
  try {
    const actual = await ejercicioActual();
    const ejercicio = q.data ?? actual;
    const [ventas, comisionPct, archivados] = await Promise.all([leerPlan(ejercicio), getComisionPlan(), planesArchivados(actual)]);
    res.json({ ejercicio, comisionPct, ventas, archivados });
  } catch (e) { sendInternalError(res, e, 'GET /api/fiscal/plan'); }
});

// PUT /api/fiscal/plan { ventas }: sustituye el plan del ejercicio en curso.
router.put('/plan', async (req: Request, res: Response) => {
  const p = guardarSchema.safeParse(req.body ?? {});
  if (!p.success) return sendZodError(res, p.error);
  try {
    await guardarPlan(await ejercicioActual(), p.data.ventas);
    res.json({ ok: true });
  } catch (e) {
    // Una wallet que no existe (clave foránea).
    if ((e as { code?: string }).code === '23503') return res.status(400).json({ error: 'Alguna wallet del plan no existe' });
    sendInternalError(res, e, 'PUT /api/fiscal/plan');
  }
});

// DELETE /api/fiscal/plan[?ejercicio=AAAA]: vacía el plan del ejercicio (por defecto, el actual).
router.delete('/plan', async (req: Request, res: Response) => {
  const q = ejercicioQuery.safeParse(req.query.ejercicio);
  if (!q.success) return res.status(400).json({ error: 'Ejercicio inválido' });
  try {
    res.json({ ok: true, quitadas: await vaciarPlan(q.data ?? await ejercicioActual()) });
  } catch (e) { sendInternalError(res, e, 'DELETE /api/fiscal/plan'); }
});

// POST /api/fiscal/plan/simular { ventas, comisionPct }: efecto conjunto del plan.
router.post('/plan/simular', async (req: Request, res: Response) => {
  const p = simularSchema.safeParse(req.body ?? {});
  if (!p.success) return sendZodError(res, p.error);
  try {
    const year = await ejercicioActual();
    const assets = [...new Set(p.data.ventas.map(v => v.asset))];
    const [lotes, anios, tipos, comprasRecientes] = await Promise.all([
      lotesDePlan(assets), cargarAniosFiscales(year), escalaDe(db, year), comprasRecientesReales(assets),
    ]);
    res.json(simularPlan({ lotes, anios, year, tipos, ventas: p.data.ventas, comisionPct: p.data.comisionPct, comprasRecientes }));
  } catch (e) { sendInternalError(res, e, 'POST /api/fiscal/plan/simular'); }
});

export default router;
