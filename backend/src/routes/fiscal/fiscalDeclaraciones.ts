import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { compararCifras, type CifrasRenta } from '../../modules/fiscal/declaraciones';
import { borrarDeclaracion, cifrasRenta, guardarDeclaracion, listarDeclaraciones, restaurarDeclaracion } from '../../modules/fiscal/declaracionesRepo';
import { getUmbral721, sumaValorCustodiaExchange, valorizarLotesEnFecha } from '../../modules/fiscal/lotesValoracion';
import { parseYear, sendZodError } from './fiscalShared';
import { sendInternalError } from '../../middleware/errorHandler';
import { resetObligaciones721Cache } from '../../modules/fiscal/obligacion721';
import { endOfLocalYear, localYearMonth } from '../../modules/time/localTime';
import { getAppTimezone } from '../../modules/time/appTimezone';
import { db } from '../../db/client';

// Estado de la declaración de un ejercicio cerrado (#311, #542): revisado,
// Renta presentada y Modelo 721 presentado. Se consultan las marcas (con los
// cambios de cifras desde la revisión o la presentación de la Renta), se
// quitan y, para Deshacer, se restauran tal como estaban. Las cifras las
// calcula el backend.
const router = Router();

const tipoSchema = z.enum(['renta', 'modelo721', 'revision']);
// Deshacer (#542): la marca tal como estaba, con su fecha y sus cifras.
const restaurarSchema = z.strictObject({
  declaradoEn: z.iso.datetime(),
  cifras: z.record(z.string().regex(/^[a-z0-9]{1,20}$/i), z.number().finite().min(-1e12).max(1e12)).refine(c => Object.keys(c).length <= 20, 'Demasiadas cifras'),
});
const vacio = z.strictObject({});
const modelo721Schema = z.strictObject({ valor: z.number().min(0).max(1e12).optional() });

/** Solo ejercicios cerrados: el año en curso aún no se ha declarado. */
function ejercicioCerrado(raw: string, res: Response, tz: string): number | null {
  const year = parseYear(raw);
  if (!year) { res.status(400).json({ error: 'Año inválido' }); return null; }
  if (year >= localYearMonth(tz).year) { res.status(400).json({ error: 'Solo se pueden marcar ejercicios cerrados' }); return null; }
  return year;
}

// GET /api/fiscal/declaraciones
router.get('/declaraciones', async (_req: Request, res: Response) => {
  try {
    const lista = await listarDeclaraciones();
    // Cambios desde que se presentó la Renta o se revisó el ejercicio (#542).
    const out = await Promise.all(lista.map(async d => d.tipo === 'renta' || d.tipo === 'revision'
      ? { ...d, cambios: compararCifras(d.cifras as Partial<CifrasRenta>, await cifrasRenta(d.ejercicio)) }
      : d));
    res.json(out);
  } catch (e) {
    sendInternalError(res, e, 'GET /api/fiscal/declaraciones');
  }
});

// PUT /api/fiscal/:year/declaracion/renta — guarda (o actualiza) las cifras actuales
router.put('/:year/declaracion/renta', async (req: Request, res: Response) => {
  const tz = await getAppTimezone(db);
  const year = ejercicioCerrado(req.params.year, res, tz);
  if (!year) return;
  const parsed = vacio.safeParse(req.body ?? {});
  if (!parsed.success) return sendZodError(res, parsed.error);
  try {
    res.json(await guardarDeclaracion(year, 'renta', await cifrasRenta(year)));
  } catch (e) {
    sendInternalError(res, e, 'PUT /api/fiscal/:year/declaracion/renta');
  }
});

// PUT /api/fiscal/:year/declaracion/revision — ejercicio revisado (#542), con las cifras del momento
router.put('/:year/declaracion/revision', async (req: Request, res: Response) => {
  const tz = await getAppTimezone(db);
  const year = ejercicioCerrado(req.params.year, res, tz);
  if (!year) return;
  const parsed = vacio.safeParse(req.body ?? {});
  if (!parsed.success) return sendZodError(res, parsed.error);
  try {
    res.json(await guardarDeclaracion(year, 'revision', await cifrasRenta(year)));
  } catch (e) {
    sendInternalError(res, e, 'PUT /api/fiscal/:year/declaracion/revision');
  }
});

// PUT /api/fiscal/:year/declaracion/:tipo/restaurar — Deshacer (#542): la marca tal como estaba
router.put('/:year/declaracion/:tipo/restaurar', async (req: Request, res: Response) => {
  const tz = await getAppTimezone(db);
  const year = ejercicioCerrado(req.params.year, res, tz);
  if (!year) return;
  const tipo = tipoSchema.safeParse(req.params.tipo);
  if (!tipo.success) return res.status(400).json({ error: 'Tipo inválido' });
  const parsed = restaurarSchema.safeParse(req.body ?? {});
  if (!parsed.success) return sendZodError(res, parsed.error);
  try {
    const restaurada = await restaurarDeclaracion({ ejercicio: year, tipo: tipo.data, ...parsed.data });
    if (tipo.data === 'modelo721') resetObligaciones721Cache();
    res.json(restaurada);
  } catch (e) {
    sendInternalError(res, e, 'PUT /api/fiscal/:year/declaracion/:tipo/restaurar');
  }
});

// PUT /api/fiscal/:year/declaracion/modelo721 — valor declarado (por defecto, el de 31 dic)
router.put('/:year/declaracion/modelo721', async (req: Request, res: Response) => {
  const tz = await getAppTimezone(db);
  const year = ejercicioCerrado(req.params.year, res, tz);
  if (!year) return;
  const parsed = modelo721Schema.safeParse(req.body ?? {});
  if (!parsed.success) return sendZodError(res, parsed.error);
  try {
    let valor = parsed.data.valor;
    if (valor === undefined) {
      const { activos } = await valorizarLotesEnFecha(endOfLocalYear(tz, year));
      valor = Math.round(sumaValorCustodiaExchange(activos) * 100) / 100;
    }
    const guardada = await guardarDeclaracion(year, 'modelo721', { valor, umbral: await getUmbral721() });
    resetObligaciones721Cache();   // cambia la regla del incremento para el calendario
    res.json(guardada);
  } catch (e) {
    sendInternalError(res, e, 'PUT /api/fiscal/:year/declaracion/modelo721');
  }
});

// DELETE /api/fiscal/:year/declaracion/:tipo
router.delete('/:year/declaracion/:tipo', async (req: Request, res: Response) => {
  const year = parseYear(req.params.year);
  const tipo = tipoSchema.safeParse(req.params.tipo);
  if (!year || !tipo.success) return res.status(400).json({ error: 'Año o tipo inválido' });
  try {
    const previa = await borrarDeclaracion(year, tipo.data);
    if (!previa) return res.status(404).json({ error: 'No estaba marcado' });
    if (tipo.data === 'modelo721') resetObligaciones721Cache();
    // Devuelve lo que había, para poder deshacerlo (#542).
    res.json({ ok: true, previa });
  } catch (e) {
    sendInternalError(res, e, 'DELETE /api/fiscal/:year/declaracion/:tipo');
  }
});

export default router;
