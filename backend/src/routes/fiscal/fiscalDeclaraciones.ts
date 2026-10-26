import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { compararCifras, type CifrasRenta } from '../../modules/fiscal/declaraciones';
import { borrarDeclaracion, cifrasRenta, guardarDeclaracion, listarDeclaraciones } from '../../modules/fiscal/declaracionesRepo';
import { getUmbral721, sumaValorCustodiaExchange, valorizarLotesEnFecha } from '../../modules/fiscal/lotesValoracion';
import { endOfYearMadrid, madridYearMonth } from '../../modules/fiscal/madridTime';
import { parseYear, sendZodError } from './fiscalShared';
import { sendInternalError } from '../../middleware/errorHandler';
import { resetObligaciones721Cache } from '../../modules/fiscal/obligacion721';

// Ejercicios declarados (#311): marcar la Renta o el Modelo 721 de un
// ejercicio cerrado, consultar las marcas (con los cambios de la Renta desde
// que se declaró) y quitarlas. Las cifras de la Renta las calcula el backend.
const router = Router();

const tipoSchema = z.enum(['renta', 'modelo721']);
const vacio = z.strictObject({});
const modelo721Schema = z.strictObject({ valor: z.number().min(0).max(1e12).optional() });

/** Solo ejercicios cerrados: el año en curso aún no se ha declarado. */
function ejercicioCerrado(raw: string, res: Response): number | null {
  const year = parseYear(raw);
  if (!year) { res.status(400).json({ error: 'Año inválido' }); return null; }
  if (year >= madridYearMonth().year) { res.status(400).json({ error: 'Solo se pueden marcar ejercicios cerrados' }); return null; }
  return year;
}

// GET /api/fiscal/declaraciones
router.get('/declaraciones', async (_req: Request, res: Response) => {
  try {
    const lista = await listarDeclaraciones();
    const out = await Promise.all(lista.map(async d => d.tipo === 'renta'
      ? { ...d, cambios: compararCifras(d.cifras as Partial<CifrasRenta>, await cifrasRenta(d.ejercicio)) }
      : d));
    res.json(out);
  } catch (e) {
    sendInternalError(res, e, 'GET /api/fiscal/declaraciones');
  }
});

// PUT /api/fiscal/:year/declaracion/renta — guarda (o actualiza) las cifras actuales
router.put('/:year/declaracion/renta', async (req: Request, res: Response) => {
  const year = ejercicioCerrado(req.params.year, res);
  if (!year) return;
  const parsed = vacio.safeParse(req.body ?? {});
  if (!parsed.success) return sendZodError(res, parsed.error);
  try {
    res.json(await guardarDeclaracion(year, 'renta', await cifrasRenta(year)));
  } catch (e) {
    sendInternalError(res, e, 'PUT /api/fiscal/:year/declaracion/renta');
  }
});

// PUT /api/fiscal/:year/declaracion/modelo721 — valor declarado (por defecto, el de 31 dic)
router.put('/:year/declaracion/modelo721', async (req: Request, res: Response) => {
  const year = ejercicioCerrado(req.params.year, res);
  if (!year) return;
  const parsed = modelo721Schema.safeParse(req.body ?? {});
  if (!parsed.success) return sendZodError(res, parsed.error);
  try {
    let valor = parsed.data.valor;
    if (valor === undefined) {
      const { activos } = await valorizarLotesEnFecha(endOfYearMadrid(year));
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
    if (!(await borrarDeclaracion(year, tipo.data))) return res.status(404).json({ error: 'No estaba marcado' });
    if (tipo.data === 'modelo721') resetObligaciones721Cache();
    res.json({ ok: true });
  } catch (e) {
    sendInternalError(res, e, 'DELETE /api/fiscal/:year/declaracion/:tipo');
  }
});

export default router;
