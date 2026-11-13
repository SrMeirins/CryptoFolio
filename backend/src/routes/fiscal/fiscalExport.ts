import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { db } from '../../db/client';
import { getEventosAnio } from '../../modules/fiscal/eventosAnio';
import { cargarAniosFiscales } from '../../modules/fiscal/carryforward';
import { escalaDe } from '../../modules/fiscal/escalasAhorro';
import { construirExport, fechaEs, FORMATOS_EXPORT, SECCIONES } from '../../modules/fiscal/export/datosExport';
import { writeCsvGeneral } from '../../modules/fiscal/export/csvExport';
import { writeRentaWebCsv } from '../../modules/fiscal/export/rentaWebExport';
import { writeExcelExport } from '../../modules/fiscal/export/excelExport';
import { writePdfExport } from '../../modules/fiscal/export/pdfExport';
import { sendInternalError } from '../../middleware/errorHandler';
import { getAppTimezone } from '../../modules/time/appTimezone';
import { localDate } from '../../modules/time/localTime';
import { parseYear } from './fiscalShared';

const router = Router();

// GET /api/fiscal/:year/export?format=csv|rentaweb|excel|pdf[&secciones=a,b]
// (#547). Transporte puro: arma los datos del ejercicio una vez
// (datosExport.ts) y cada formato los escribe; las secciones solo aplican a
// Excel y PDF (el CSV y Renta Web tienen formato fijo). Sin secciones, todas.
const querySchema = z.object({
  format: z.enum(FORMATOS_EXPORT).default('csv'),
  secciones: z.string().optional()
    .transform(v => (v === undefined || v === '' ? [...SECCIONES] : v.split(',')))
    .pipe(z.array(z.enum(SECCIONES)).min(1).transform(lista => SECCIONES.filter(s => lista.includes(s)))),
});

router.get('/:year/export', async (req: Request, res: Response) => {
  const year = parseYear(req.params.year);
  if (!year) return res.status(400).json({ error: 'Año inválido' });
  const q = querySchema.safeParse(req.query);
  if (!q.success) return res.status(400).json({ error: 'Formato o secciones no válidos. Formatos: csv, rentaweb, excel, pdf' });
  try {
    const [{ fiscalEvents, rendimientos }, anios, tipos, tz] = await Promise.all([
      getEventosAnio(year), cargarAniosFiscales(year), escalaDe(db, year), getAppTimezone(db),
    ]);
    const datos = construirExport({ year, eventos: fiscalEvents, rendimientos, anios, tipos });
    const { format, secciones } = q.data;
    if (format === 'csv') writeCsvGeneral(res, datos);
    else if (format === 'rentaweb') writeRentaWebCsv(res, datos);
    else if (format === 'excel') await writeExcelExport(res, datos, secciones);
    else await writePdfExport(res, datos, secciones, fechaEs(localDate(tz, new Date())));
  } catch (e) {
    sendInternalError(res, e, 'GET /api/fiscal/:year/export');
  }
});

export default router;
