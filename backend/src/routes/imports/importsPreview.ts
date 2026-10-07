import { Router, Request, Response } from 'express';
import { previewCsvFile } from '../../modules/csv/importer';
import { Exchange, isExchange } from '../../modules/csv/exchanges';
import { upload } from './importsValidation';

const router = Router();

// POST /api/imports/preview
//
// El mensaje de error reenviado al cliente proviene de previewCsvFile(), que
// lanza mensajes deliberadamente seguros y legibles (formato de CSV inválido,
// cabeceras no reconocidas) — no es el mismo patrón de fuga que prices.ts/
// fifo.ts (datos internos de Postgres/red). Mantenerlo así es intencional:
// introducir una clase de error dedicada para distinguir "seguro de mostrar"
// de "interno" sería sobre-ingeniería para un riesgo que nunca se ha
// materializado en esta app mono-usuario.
router.post('/preview', upload.single('file'), async (req: Request, res: Response) => {
  if (!req.file) { res.status(400).json({ error: 'No se recibió ningún archivo' }); return; }
  const exchange: Exchange = isExchange(req.body.exchange) ? req.body.exchange : 'binance';
  try {
    const result = await previewCsvFile(req.file.buffer, exchange);
    res.json(result);
  } catch (err) {
    res.status(422).json({ error: (err as Error).message });
  }
});

export default router;
