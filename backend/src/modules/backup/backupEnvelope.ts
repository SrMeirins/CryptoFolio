import { z } from 'zod';
import { BACKUP_TABLE_NAMES, countRows, type BackupCounts, type BackupData, type BackupTable } from './backupTables';
import { BackupDecryptError, MIN_PASSWORD_LENGTH, open, seal, type KdfParams } from './backupCrypto';

// Formato del fichero de copia (#453). Una cabecera en claro (formato,
// versión de datos, fecha) y los datos, en claro o cifrados. La versión de
// datos es el número de la última migración: se aceptan copias de esa
// versión o anteriores (sus columnas son un subconjunto de las actuales).

export const BACKUP_FORMAT = 'cryptofolio-backup';
// Debe coincidir con la última migración de db/migrations (lo comprueba un test).
export const BACKUP_SCHEMA = 20;
const MAX_ROWS = 1_000_000;

export class BackupFormatError extends Error {
  constructor(message: string, readonly code: 'formato' | 'version' | 'contrasena' | 'datos') { super(message); }
}

const rowsSchema = z.array(z.record(z.string(), z.unknown())).max(MAX_ROWS).default([]);
const dataSchema = z.object(
  Object.fromEntries(BACKUP_TABLE_NAMES.map(t => [t, rowsSchema])) as Record<BackupTable, typeof rowsSchema>,
).strict();

const b64 = z.string().regex(/^[A-Za-z0-9+/]*={0,2}$/, 'base64 inválido');
const headerSchema = z.object({
  format: z.literal(BACKUP_FORMAT),
  schema: z.number().int().min(1),
  exported_at: z.iso.datetime(),
});
const plainSchema = headerSchema.extend({ encrypted: z.literal(false), counts: z.record(z.string(), z.number()).optional(), data: z.unknown() });
const sealedSchema = headerSchema.extend({
  encrypted: z.literal(true),
  kdf: z.object({ name: z.literal('argon2id'), salt: b64, memory: z.number().int(), iterations: z.number().int(), parallelism: z.number().int() }),
  cipher: z.object({ name: z.literal('aes-256-gcm'), iv: b64, tag: b64 }),
  payload: b64,
});
const envelopeSchema = z.discriminatedUnion('encrypted', [plainSchema, sealedSchema]);

export interface OpenedBackup {
  schema: number;
  exported_at: string;
  encrypted: boolean;
  data: BackupData;
  counts: BackupCounts;
}

// La cabecera autenticada: cambiar cualquiera de estos campos invalida la etiqueta GCM.
function aadOf(h: { format: string; schema: number; exported_at: string }, kdf: KdfParams): string {
  return JSON.stringify({ format: h.format, schema: h.schema, exported_at: h.exported_at, kdf: {
    name: kdf.name, salt: kdf.salt, memory: kdf.memory, iterations: kdf.iterations, parallelism: kdf.parallelism,
  } });
}

export function validatePassword(password: string | undefined): string | null {
  if (password === undefined) return null;
  return password.length >= MIN_PASSWORD_LENGTH ? null : `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres`;
}

/** Construye el fichero de copia; con contraseña, cifrado. */
export async function buildBackup(data: BackupData, password?: string, now = new Date()): Promise<Record<string, unknown>> {
  const header = { format: BACKUP_FORMAT, schema: BACKUP_SCHEMA, exported_at: now.toISOString() };
  if (!password) return { ...header, encrypted: false, counts: countRows(data), data };
  const sealed = await seal(JSON.stringify(data), password, kdf => aadOf(header, kdf));
  return { ...header, encrypted: true, ...sealed };
}

/** Lee y valida un fichero de copia. No toca la base de datos. */
export async function openBackup(raw: unknown, password?: string): Promise<OpenedBackup> {
  if (raw && typeof raw === 'object' && (raw as { version?: unknown }).version === '1.0') {
    throw new BackupFormatError('Es una copia del formato anterior, que no se puede restaurar. Exporta una nueva desde esta versión.', 'formato');
  }
  const head = headerSchema.safeParse(raw);
  if (!head.success) throw new BackupFormatError('El fichero no es una copia de CryptoFolio.', 'formato');
  if (head.data.schema > BACKUP_SCHEMA) {
    throw new BackupFormatError('La copia es de una versión más nueva de la app. Actualiza la app antes de restaurarla.', 'version');
  }
  const env = envelopeSchema.safeParse(raw);
  if (!env.success) throw new BackupFormatError('La copia está incompleta o dañada.', 'formato');

  let payload: unknown;
  if (env.data.encrypted) {
    if (!password) throw new BackupFormatError('La copia está cifrada: indica la contraseña.', 'contrasena');
    const e = env.data;
    const kdf: KdfParams = { ...e.kdf };
    try {
      const text = await open({ kdf, cipher: e.cipher, payload: e.payload }, password, aadOf(e, kdf));
      payload = JSON.parse(text);
    } catch (err) {
      if (err instanceof BackupDecryptError) throw new BackupFormatError(err.message, 'contrasena');
      throw new BackupFormatError('La copia está dañada.', 'datos');
    }
  } else {
    payload = env.data.data;
  }
  const data = dataSchema.safeParse(payload);
  if (!data.success) throw new BackupFormatError('Los datos de la copia no tienen la forma esperada.', 'datos');
  const parsed = data.data as BackupData;
  return { schema: env.data.schema, exported_at: env.data.exported_at, encrypted: env.data.encrypted, data: parsed, counts: countRows(parsed) };
}
