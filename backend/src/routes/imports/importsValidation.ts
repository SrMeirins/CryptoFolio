import multer from 'multer';
import { z } from 'zod';
import type { Request, Response, NextFunction } from 'express';
import { CABECERAS_RETIRADAS, esHistorialRetiradas } from '../../modules/csv/retiradas/historialRetiradas';

// Magic bytes de CSV: texto plano — los primeros bytes no deben ser un ejecutable
const BINARY_MAGIC = [
  [0x4d, 0x5a],             // MZ — PE/EXE Windows
  [0x7f, 0x45, 0x4c, 0x46], // ELF — Linux executable
  [0xff, 0xd8, 0xff],       // JPEG
  [0x89, 0x50, 0x4e, 0x47], // PNG
  [0x50, 0x4b, 0x03, 0x04], // ZIP / DOCX / XLSX
  [0x25, 0x50, 0x44, 0x46], // %PDF
];

export function hasBinaryMagic(buf: Buffer): boolean {
  return BINARY_MAGIC.some(magic => magic.every((b, i) => buf[i] === b));
}

export const MAX_CSV_MB = 10;

/** Historial de retiradas opcional de la petición (#320), ya validado por uploadCsv. */
export function retiradasDe(req: Request): Buffer | undefined {
  const files = (req.files ?? {}) as Record<string, Express.Multer.File[] | undefined>;
  return files.withdrawals?.[0]?.buffer;
}

/** Archivo rechazado por su tipo (#316): se responde 400 con el motivo, no 500. */
class TipoArchivoError extends Error {}

export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_CSV_MB * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = file.originalname.toLowerCase();
    if (!ext.endsWith('.csv')) {
      cb(new TipoArchivoError('Solo se aceptan archivos .csv'));
      return;
    }
    cb(null, true);
  },
});

/**
 * Subida de un CSV con errores comprensibles (#316): extensión no válida → 400,
 * tamaño excesivo → 413, contenido binario → 400. Antes los errores de multer
 * llegaban al manejador global como 500 «Internal server error».
 */
export function uploadCsv(req: Request, res: Response, next: NextFunction): void {
  // «withdrawals»: historial de retiradas de Binance, opcional (#320). Se normaliza a req.file.
  upload.fields([{ name: 'file', maxCount: 1 }, { name: 'withdrawals', maxCount: 1 }])(req, res, (err: unknown) => {
    if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
      res.status(413).json({ error: `El archivo supera el máximo de ${MAX_CSV_MB} MB` });
      return;
    }
    if (err instanceof TipoArchivoError) {
      res.status(400).json({ error: err.message });
      return;
    }
    if (err instanceof multer.MulterError && err.code === 'LIMIT_UNEXPECTED_FILE') {
      res.status(400).json({ error: 'Se esperaba un único CSV de transacciones y, opcionalmente, un historial de retiradas' });
      return;
    }
    if (err) { next(err); return; }
    const files = (req.files ?? {}) as Record<string, Express.Multer.File[] | undefined>;
    req.file = files.file?.[0];
    const retiradas = files.withdrawals?.[0];
    if ([req.file, retiradas].some(f => f && hasBinaryMagic(f.buffer))) {
      res.status(400).json({ error: 'El archivo no es un CSV de texto (parece un ejecutable, imagen, ZIP o PDF)' });
      return;
    }
    if (retiradas && !esHistorialRetiradas(retiradas.buffer)) {
      res.status(400).json({ error: `El historial de retiradas no es válido: se esperan las columnas ${CABECERAS_RETIRADAS.join(', ')}` });
      return;
    }
    next();
  });
}

// JSON auxiliares de POST /confirm, antes validados a mano con throw Error
// sueltos — mismos mensajes de fondo, ahora vía Zod para ser consistentes
// con el resto del backend.
const withdrawalDestinationsSchema = z.record(z.string(), z.string());
const depositCostsSchema = z.record(z.string(), z.number().nullable());

export function parseWithdrawalDestinations(raw: string | undefined): Record<string, string> {
  if (!raw) return {};
  const parsed = JSON.parse(raw);
  const result = withdrawalDestinationsSchema.safeParse(parsed);
  if (!result.success) throw new Error('withdrawalDestinations inválido');
  return result.data;
}

export function parseDepositCosts(raw: string | undefined): Record<string, number | null> {
  if (!raw) return {};
  const parsed = JSON.parse(raw);
  const result = depositCostsSchema.safeParse(parsed);
  if (!result.success) throw new Error('depositCosts inválido');
  return result.data;
}
