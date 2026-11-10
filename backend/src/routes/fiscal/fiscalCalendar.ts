import { Router, Request, Response } from 'express';
import { calendarioFiscal } from '../../modules/fiscal/calendarioFiscal';
import { obligaciones721 } from '../../modules/fiscal/obligacion721';
import { presentadas } from '../../modules/fiscal/declaracionesRepo';
import { sendInternalError } from '../../middleware/errorHandler';
import { db } from '../../db/client';
import { getAppTimezone } from '../../modules/time/appTimezone';

// GET /api/fiscal/calendario (#309): hitos del ciclo fiscal en la zona de la aplicación (#388).
const router = Router();

router.get('/calendario', async (_req: Request, res: Response) => {
  try {
    // Lo ya presentado no cuenta como próximo plazo (#542).
    res.json(calendarioFiscal(new Date(), await obligaciones721(), await getAppTimezone(db), await presentadas()));
  } catch (e) {
    sendInternalError(res, e, 'GET /api/fiscal/calendario');
  }
});

export default router;
