import { Router, Request, Response } from 'express';
import { getEventosAnio } from '../../modules/fiscal/eventosAnio';
import { writeModelo100Csv } from '../../modules/fiscal/export/csvExport';
import { writeRentaWebCsv } from '../../modules/fiscal/export/rentaWebExport';
import { writeExcelExport } from '../../modules/fiscal/export/excelExport';
import { writePdfExport } from '../../modules/fiscal/export/pdfExport';
import { parseYear } from './fiscalShared';

const router = Router();

// ── GET /api/fiscal/:year/export ───────────────────────────────────────────
// Transporte puro: resuelve los datos del año y delega el formateo a
// modules/fiscal/export/*Export.ts — cada formato vive en su propio fichero
// (antes los 4 estaban incrustados aquí mismo, ~425 líneas en un solo
// if/else if).
router.get('/:year/export', async (req: Request, res: Response) => {
  const year = parseYear(req.params.year);
  if (!year) return res.status(400).json({ error: 'Año inválido' });

  const format = (req.query.format as string) ?? 'csv';
  const { fiscalEvents, rendimientos } = await getEventosAnio(year);

  switch (format) {
    case 'csv':
      writeModelo100Csv(res, year, fiscalEvents, rendimientos);
      break;
    case 'rentaweb':
      writeRentaWebCsv(res, year, fiscalEvents);
      break;
    case 'excel':
      await writeExcelExport(res, year, fiscalEvents, rendimientos);
      break;
    case 'pdf':
      writePdfExport(res, year, fiscalEvents, rendimientos);
      break;
    default:
      res.status(400).json({ error: 'Formato no soportado. Usa: csv, excel, pdf, rentaweb' });
  }
});

export default router;
