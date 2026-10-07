import multer from 'multer';
import { z } from 'zod';

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

export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = file.originalname.toLowerCase();
    if (!ext.endsWith('.csv')) {
      cb(new Error('Solo se aceptan archivos CSV'));
      return;
    }
    cb(null, true);
  },
});

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
