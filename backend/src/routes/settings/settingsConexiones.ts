import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { sendZodError } from './settingsShared';
import { sendInternalError } from '../../middleware/errorHandler';
import { SERVICIO_IDS } from '../../modules/conexiones/servicios';
import {
  ClaveRechazada, estadoServicios, guardarClave, probarClave, quitarClave, SinClaveMaestra,
} from '../../modules/conexiones/conexiones';

// Ajustes, Conexiones (versión 1.0): claves de API de Etherscan, Blockfrost,
// Subscan y CoinGecko. Ninguna respuesta incluye la clave.
const router = Router();

const idSchema = z.object({ id: z.enum(SERVICIO_IDS) });
const guardarSchema = z.object({
  // Las claves reales son alfanuméricas con guiones; sin espacios ni controles.
  api_key: z.string().trim().min(8, 'La clave es demasiado corta').max(512, 'La clave es demasiado larga')
    .regex(/^[A-Za-z0-9._~+/=-]+$/, 'La clave tiene caracteres no válidos'),
  plan: z.enum(['demo', 'pro']).optional(),
});

router.get('/conexiones', async (_req: Request, res: Response) => {
  try {
    res.json(await estadoServicios());
  } catch (err) {
    sendInternalError(res, err, 'GET /settings/conexiones', 'No se pudo leer el estado de las claves');
  }
});

router.put('/conexiones/:id', async (req: Request, res: Response) => {
  const params = idSchema.safeParse(req.params);
  if (!params.success) return sendZodError(res, params.error);
  const body = guardarSchema.safeParse(req.body);
  if (!body.success) return sendZodError(res, body.error);
  try {
    const comprobacion = await guardarClave(params.data.id, body.data.api_key, body.data.plan);
    res.json({ guardada: true, comprobacion });
  } catch (err) {
    if (err instanceof ClaveRechazada) return res.status(422).json({ error: 'El servicio rechaza esta clave: revisa que esté completa y activa.' });
    if (err instanceof SinClaveMaestra) return res.status(409).json({ error: 'Falta la clave maestra (WALLET_SYNC_ENCRYPTION_KEY): sin ella no se pueden guardar claves.' });
    sendInternalError(res, err, 'PUT /settings/conexiones/:id', 'No se pudo guardar la clave');
  }
});

router.delete('/conexiones/:id', async (req: Request, res: Response) => {
  const params = idSchema.safeParse(req.params);
  if (!params.success) return sendZodError(res, params.error);
  try {
    await quitarClave(params.data.id);
    res.json({ quitada: true });
  } catch (err) {
    sendInternalError(res, err, 'DELETE /settings/conexiones/:id', 'No se pudo quitar la clave');
  }
});

router.post('/conexiones/:id/probar', async (req: Request, res: Response) => {
  const params = idSchema.safeParse(req.params);
  if (!params.success) return sendZodError(res, params.error);
  try {
    res.json({ comprobacion: await probarClave(params.data.id) });
  } catch (err) {
    sendInternalError(res, err, 'POST /settings/conexiones/:id/probar', 'No se pudo probar la clave');
  }
});

export default router;
