import { Router, Request, Response } from 'express';
import { detectarExchange, parseExchangeCsv, type Exchange } from '../../modules/csv/exchanges';
import { detectarZonaHoraria } from '../../modules/csv/zonaHoraria';
import {
  aplicarZonaHoraria, desfaseValido, estadoZonaHoraria, impactoZonaHoraria, ZonaHorariaError,
} from '../../modules/csv/zonaHorariaImportacion';
import { archivosDe, exchangesForzados, uploadCsv } from './importsValidation';

// Zona horaria de los CSV de Binance (#599): su columna «Time» no la indica.
const router = Router();
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function enviarError(res: Response, err: unknown): void {
  if (err instanceof ZonaHorariaError) { res.status(err.status).json({ error: err.message }); return; }
  console.error('[ZONA HORARIA]', (err as Error).message);
  res.status(500).json({ error: 'No se pudo comprobar la zona horaria' });
}

// POST /api/imports/zona-horaria: detecta la zona de cada archivo de Binance
// del lote comparando sus órdenes con el mercado. Aparte de la vista previa,
// que sigue sin salir a la red.
router.post('/zona-horaria', uploadCsv, async (req: Request, res: Response) => {
  const archivos = archivosDe(req);
  if (archivos.length === 0) { res.status(400).json({ error: 'No se recibió ningún archivo' }); return; }
  let forzados: (Exchange | null)[];
  try { forzados = exchangesForzados(req.body, archivos.length); } catch (e) { res.status(400).json({ error: (e as Error).message }); return; }
  try {
    const resultados = [];
    for (const [i, f] of archivos.entries()) {
      const exchange = forzados[i] ?? detectarExchange(f.buffer).exchange;
      if (exchange !== 'binance') { resultados.push({ nombre: f.originalname, deteccion: null }); continue; }
      const parsed = await parseExchangeCsv('binance', f.buffer);
      resultados.push({ nombre: f.originalname, deteccion: await detectarZonaHoraria(parsed.transactions) });
    }
    res.json({ archivos: resultados });
  } catch (err) {
    enviarError(res, err);
  }
});

// GET /api/imports/:id/zona-horaria: desfase actual y detección.
router.get('/:id/zona-horaria', async (req: Request, res: Response) => {
  if (!UUID_RE.test(req.params.id)) { res.status(400).json({ error: 'Id de importación inválido' }); return; }
  try { res.json(await estadoZonaHoraria(req.params.id)); } catch (err) { enviarError(res, err); }
});

// GET /api/imports/:id/zona-horaria/impacto?desfase=N: qué cambiaría.
router.get('/:id/zona-horaria/impacto', async (req: Request, res: Response) => {
  const desfase = Number(req.query.desfase);
  if (!UUID_RE.test(req.params.id)) { res.status(400).json({ error: 'Id de importación inválido' }); return; }
  if (!desfaseValido(desfase)) { res.status(400).json({ error: 'Desfase inválido: entre -12 y 14 horas' }); return; }
  try { res.json(await impactoZonaHoraria(req.params.id, desfase)); } catch (err) { enviarError(res, err); }
});

// POST /api/imports/:id/zona-horaria { desfaseHoras }: copia previa, desplaza y guarda.
router.post('/:id/zona-horaria', async (req: Request, res: Response) => {
  const desfase = (req.body as { desfaseHoras?: unknown } | undefined)?.desfaseHoras;
  if (!UUID_RE.test(req.params.id)) { res.status(400).json({ error: 'Id de importación inválido' }); return; }
  if (!desfaseValido(desfase)) { res.status(400).json({ error: 'Desfase inválido: entre -12 y 14 horas' }); return; }
  try { res.json(await aplicarZonaHoraria(req.params.id, desfase)); } catch (err) { enviarError(res, err); }
});

export default router;
