import multer from 'multer';
import { z } from 'zod';
import type { Request, Response, NextFunction } from 'express';
import { CABECERAS_RETIRADAS, esHistorialRetiradas } from '../../modules/csv/retiradas/historialRetiradas';
// Solo el tipo: el módulo de exchanges arrastra los parsers y, con ellos, el cliente de BD.
import type { Exchange } from '../../modules/csv/exchanges';

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

/** Máximo de archivos por lote (#326): de transacciones y de retiradas. */
export const MAX_ARCHIVOS_LOTE = 5;

type CamposArchivos = Record<string, Express.Multer.File[] | undefined>;

/** Historiales de retiradas de la petición (#320, #326), ya validados por uploadCsv. */
export function retiradasDe(req: Request): Buffer[] {
  return ((req.files ?? {}) as CamposArchivos).withdrawals?.map(f => f.buffer) ?? [];
}

/** Archivos de transacciones: «file» (uno, como siempre) o «files» (lote, #326). */
export function archivosDe(req: Request): Express.Multer.File[] {
  const campos = (req.files ?? {}) as CamposArchivos;
  return [...(campos.file ?? []), ...(campos.files ?? [])];
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
  // «files»: lote de historiales de transacciones (#326); «withdrawals»: historiales de
  // retiradas de Binance, opcionales (#320). El primero de transacciones queda en req.file.
  upload.fields([
    { name: 'file', maxCount: 1 },
    { name: 'files', maxCount: MAX_ARCHIVOS_LOTE },
    { name: 'withdrawals', maxCount: MAX_ARCHIVOS_LOTE },
  ])(req, res, (err: unknown) => {
    if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
      res.status(413).json({ error: `El archivo supera el máximo de ${MAX_CSV_MB} MB` });
      return;
    }
    if (err instanceof TipoArchivoError) {
      res.status(400).json({ error: err.message });
      return;
    }
    if (err instanceof multer.MulterError && err.code === 'LIMIT_UNEXPECTED_FILE') {
      res.status(400).json({ error: `Como máximo ${MAX_ARCHIVOS_LOTE} historiales de transacciones y ${MAX_ARCHIVOS_LOTE} de retiradas por lote` });
      return;
    }
    if (err) { next(err); return; }
    const campos = (req.files ?? {}) as CamposArchivos;
    const transacciones = archivosDe(req);
    if (transacciones.length > MAX_ARCHIVOS_LOTE) {
      res.status(400).json({ error: `Como máximo ${MAX_ARCHIVOS_LOTE} historiales de transacciones por lote` });
      return;
    }
    req.file = transacciones[0];
    const retiradas = campos.withdrawals ?? [];
    const binario = [...transacciones, ...retiradas].find(f => hasBinaryMagic(f.buffer));
    if (binario) {
      res.status(400).json({ error: `«${binario.originalname}» no es un CSV de texto (parece un ejecutable, imagen, ZIP o PDF)` });
      return;
    }
    const malRetirada = retiradas.find(f => !esHistorialRetiradas(f.buffer));
    if (malRetirada) {
      res.status(400).json({ error: `El historial de retiradas no es válido («${malRetirada.originalname}»): se esperan las columnas ${CABECERAS_RETIRADAS.join(', ')}` });
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

// Exchange forzado por archivo (#326): misma posición que los archivos; null = detectar.
const exchangesSchema = z.array(z.enum(['binance', 'bitvavo']).nullable()).max(MAX_ARCHIVOS_LOTE);

/** Exchanges elegidos para cada archivo: `exchanges` (lote, JSON) o `exchange` (uno). Lanza si no son válidos. */
export function exchangesForzados(body: Record<string, unknown>, n: number): (Exchange | null)[] {
  if (typeof body.exchanges === 'string') {
    let crudo: unknown;
    try { crudo = JSON.parse(body.exchanges); } catch { throw new Error('exchanges no es JSON válido'); }
    const v = exchangesSchema.safeParse(crudo);
    if (!v.success || v.data.length > n) throw new Error('exchanges no es válido');
    return Array.from({ length: n }, (_, i) => v.data[i] ?? null);
  }
  const uno = body.exchange === 'binance' || body.exchange === 'bitvavo' ? body.exchange : null;
  return Array.from({ length: n }, (_, i) => (i === 0 ? uno : null));
}
