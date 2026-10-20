import { Router, Request, Response } from 'express';
import { previewCsvFile } from '../../modules/csv/importer';
import { CABECERAS_ESPERADAS, detectarExchange, Exchange } from '../../modules/csv/exchanges';
import { combinarVistasPrevias, type VistaArchivo } from '../../modules/csv/lote';
import { compararCobertura } from '../../modules/csv/cobertura';
import { coberturaActual } from '../../modules/csv/coberturaDb';
import { archivosDe, exchangesForzados, retiradasDe, uploadCsv } from './importsValidation';

const router = Router();

// POST /api/imports/preview
//
// Uno o varios historiales de transacciones (#326). Cada archivo se detecta por
// sus cabeceras (#318) salvo que se fuerce su exchange, y las vistas previas se
// combinan en una sola revisión (repetidas entre archivos, depósitos sin repetir).
// Los mensajes reenviados al cliente son deliberadamente seguros y legibles.
router.post('/preview', uploadCsv, async (req: Request, res: Response) => {
  const archivos = archivosDe(req);
  if (archivos.length === 0) { res.status(400).json({ error: 'No se recibió ningún archivo' }); return; }
  let forzados: (Exchange | null)[];
  try { forzados = exchangesForzados(req.body, archivos.length); } catch (e) { res.status(400).json({ error: (e as Error).message }); return; }

  try {
    const retiradas = retiradasDe(req);
    const vistas: VistaArchivo[] = [];
    for (const [i, f] of archivos.entries()) {
      const deteccion = detectarExchange(f.buffer);
      const exchange: Exchange = forzados[i] ?? deteccion.exchange ?? 'binance';
      vistas.push({
        nombre: f.originalname, exchange,
        deteccion: { ...deteccion, reconocido: deteccion.exchange !== null },
        resultado: await previewCsvFile(f.buffer, exchange, retiradas),
      });
    }
    const lote = combinarVistasPrevias(vistas);
    const primera = vistas[0];

    // Encaje del lote en la cobertura de cada exchange (#328): solo los archivos con novedades.
    const nuevos = lote.archivos.filter(a => a.estado === 'listo' && a.rango).map(a => ({
      exchange: a.exchange,
      rango: { importId: null, archivo: a.nombre, desde: a.rango!.from, hasta: a.rango!.to, transacciones: a.nuevas, nuevo: true },
    }));
    const { antes, despues } = await coberturaActual(nuevos);
    const exchangesLote = new Set(nuevos.map(n => n.exchange));
    const cobertura = despues.filter(c => exchangesLote.has(c.exchange));
    const encaje = { cobertura, cambios: cobertura.flatMap(c => compararCobertura(antes.get(c.exchange) ?? null, c)) };
    res.json({
      ...lote,
      encaje,
      exchange: primera.exchange,
      // Con un solo archivo se mantiene la detección de siempre (pantalla de formato no reconocido).
      ...(vistas.length === 1 ? { deteccion: { ...primera.deteccion, esperadas: CABECERAS_ESPERADAS } } : {}),
    });
  } catch (err) {
    res.status(422).json({ error: (err as Error).message });
  }
});

export default router;
