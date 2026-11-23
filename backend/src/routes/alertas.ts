import { Router, Request, Response } from 'express';
import { activoExiste, borrarAlerta, crearAlerta, editarAlerta, listarAlertas } from '../modules/alertas/alertasRepo';
import { crearAlertaSchema, editarAlertaSchema, idSchema } from '../modules/alertas/alertasSchema';
import { evaluadorAlertas } from '../modules/alertas/servicio';
import { sendZodError } from '../modules/validation/zodErrors';
import { sendInternalError } from '../middleware/errorHandler';

// ── /api/v1/alertas (#519) ─────────────────────────────────────────────────
// GET lista; POST crea (400 si no es válida o el activo no existe; 409 si ya
// hay una de cartera); PUT edita o pausa (cambios parciales); DELETE borra.
// Tras cada cambio el evaluador vuelve a leer las alertas y evalúa la del
// activo con su precio actual, sin esperar al siguiente cambio.

const router = Router();

router.get('/', async (_req: Request, res: Response) => {
  try {
    res.json({ alertas: await listarAlertas() });
  } catch (e) { sendInternalError(res, e, 'GET /api/v1/alertas'); }
});

router.post('/', async (req: Request, res: Response) => {
  const parsed = crearAlertaSchema.safeParse(req.body);
  if (!parsed.success) { sendZodError(res, parsed.error); return; }
  try {
    if (parsed.data.tipo === 'precio' && !(await activoExiste(parsed.data.activo))) {
      res.status(400).json({ error: `El activo ${parsed.data.activo} no existe` });
      return;
    }
    const creada = await crearAlerta(parsed.data);
    // Se evalúa enseguida con el precio actual: no hace falta esperar al siguiente cambio.
    await evaluadorAlertas.recargar();
    if (creada.activo) await evaluadorAlertas.alCambiarPrecios([creada.activo]);
    res.status(201).json({ alerta: (await listarAlertas()).find(a => a.id === creada.id) ?? creada });
  } catch (e) {
    if ((e as { code?: string }).code === '23505') { res.status(409).json({ error: 'Ya hay una alerta de cartera: edítala en lugar de crear otra' }); return; }
    sendInternalError(res, e, 'POST /api/v1/alertas');
  }
});

router.put('/:id', async (req: Request, res: Response) => {
  const id = idSchema.safeParse(req.params.id);
  if (!id.success) { sendZodError(res, id.error); return; }
  const parsed = editarAlertaSchema.safeParse(req.body);
  if (!parsed.success) { sendZodError(res, parsed.error); return; }
  try {
    const editada = await editarAlerta(id.data, parsed.data);
    if (!editada) { res.status(404).json({ error: 'Alerta no encontrada' }); return; }
    await evaluadorAlertas.recargar();
    if (editada.activo) await evaluadorAlertas.alCambiarPrecios([editada.activo]);
    res.json({ alerta: (await listarAlertas()).find(a => a.id === editada.id) ?? editada });
  } catch (e) { sendInternalError(res, e, 'PUT /api/v1/alertas/:id'); }
});

router.delete('/:id', async (req: Request, res: Response) => {
  const id = idSchema.safeParse(req.params.id);
  if (!id.success) { sendZodError(res, id.error); return; }
  try {
    if (!(await borrarAlerta(id.data))) { res.status(404).json({ error: 'Alerta no encontrada' }); return; }
    await evaluadorAlertas.recargar();
    res.status(204).end();
  } catch (e) { sendInternalError(res, e, 'DELETE /api/v1/alertas/:id'); }
});

export default router;
