import { Router, Request, Response } from 'express';
import { calendarioFiscal } from '../../modules/fiscal/calendarioFiscal';
import { obligaciones721 } from '../../modules/fiscal/obligacion721';
import { sendInternalError } from '../../middleware/errorHandler';

// GET /api/fiscal/calendario (#309): hitos del ciclo fiscal en hora de Madrid.
const router = Router();

router.get('/calendario', async (_req: Request, res: Response) => {
  try {
    res.json(calendarioFiscal(new Date(), await obligaciones721()));
  } catch (e) {
    sendInternalError(res, e, 'GET /api/fiscal/calendario');
  }
});

export default router;
