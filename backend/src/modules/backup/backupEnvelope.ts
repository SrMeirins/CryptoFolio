import { z } from 'zod';
import { BACKUP_TABLE_NAMES, countRows, type BackupCounts, type BackupData, type BackupTable } from './backupTables';
import {
  BackupDecryptError, MACHINE_KEY_INFO, MIN_PASSWORD_LENGTH, open, openWithKey, seal, sealWithKey,
  type KdfParams, type MachineKdf,
} from './backupCrypto';

// Formato del fichero de copia (#453). Una cabecera en claro (formato,
// versión de datos, fecha) y los datos, en claro o cifrados. La versión de
// datos es el número de la última migración: se aceptan copias de esa
// versión o anteriores (sus columnas son un subconjunto de las actuales).
// Las cifradas lo están con una contraseña (Argon2id) o, las automáticas
// (#454), con la clave del equipo.

export const BACKUP_FORMAT = 'cryptofolio-backup';
// Debe coincidir con la última migración de db/migrations (lo comprueba un test).
export const BACKUP_SCHEMA = 20;
const MAX_ROWS = 1_000_000;

export class BackupFormatError extends Error {
  constructor(message: string, readonly code: 'formato' | 'version' | 'contrasena' | 'equipo' | 'datos') { super(message); }
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
  kdf: z.discriminatedUnion('name', [
    z.object({ name: z.literal('argon2id'), salt: b64, memory: z.number().int(), iterations: z.number().int(), parallelism: z.number().int() }),
    z.object({ name: z.literal('equipo'), info: z.literal(MACHINE_KEY_INFO) }),
  ]),
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

/** Con qué se cifra o se abre una copia: contraseña o clave del equipo. */
export interface BackupKeys { password?: string; machineKey?: Buffer | null }

type Header = { format: string; schema: number; exported_at: string };

// La cabecera autenticada: cambiar cualquiera de estos campos invalida la etiqueta GCM.
function aadOf(h: Header, kdf: KdfParams | MachineKdf): string {
  const k = kdf.name === 'argon2id'
    ? { name: kdf.name, salt: kdf.salt, memory: kdf.memory, iterations: kdf.iterations, parallelism: kdf.parallelism }
    : { name: kdf.name, info: kdf.info };
  return JSON.stringify({ format: h.format, schema: h.schema, exported_at: h.exported_at, kdf: k });
}

export function validatePassword(password: string | undefined): string | null {
  if (password === undefined) return null;
  return password.length >= MIN_PASSWORD_LENGTH ? null : `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres`;
}

/** Construye el fichero de copia: con contraseña o clave del equipo, cifrado; sin ninguna, en claro. */
export async function buildBackup(data: BackupData, keys: BackupKeys = {}, now = new Date()): Promise<Record<string, unknown>> {
  const header: Header = { format: BACKUP_FORMAT, schema: BACKUP_SCHEMA, exported_at: now.toISOString() };
  const plaintext = () => JSON.stringify(data);
  if (keys.password) return { ...header, encrypted: true, ...(await seal(plaintext(), keys.password, kdf => aadOf(header, kdf))) };
  if (keys.machineKey) return { ...header, encrypted: true, ...sealWithKey(plaintext(), keys.machineKey, kdf => aadOf(header, kdf)) };
  return { ...header, encrypted: false, counts: countRows(data), data };
}

/** Lee y valida un fichero de copia. No toca la base de datos. */
export async function openBackup(raw: unknown, keys: BackupKeys = {}): Promise<OpenedBackup> {
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
    payload = await decryptPayload(env.data, keys);
  } else {
    payload = env.data.data;
  }
  const data = dataSchema.safeParse(payload);
  if (!data.success) throw new BackupFormatError('Los datos de la copia no tienen la forma esperada.', 'datos');
  const parsed = data.data as BackupData;
  return { schema: env.data.schema, exported_at: env.data.exported_at, encrypted: env.data.encrypted, data: parsed, counts: countRows(parsed) };
}

async function decryptPayload(e: z.infer<typeof sealedSchema>, keys: BackupKeys): Promise<unknown> {
  const kdf = e.kdf;
  let text: string;
  try {
    if (kdf.name === 'argon2id') {
      if (!keys.password) throw new BackupFormatError('La copia está cifrada: indica la contraseña.', 'contrasena');
      text = await open({ kdf, cipher: e.cipher, payload: e.payload }, keys.password, aadOf(e, kdf));
    } else {
      if (!keys.machineKey) throw new BackupFormatError('Es una copia automática de otro equipo: solo se abre donde se hizo.', 'equipo');
      text = openWithKey({ kdf, cipher: e.cipher, payload: e.payload }, keys.machineKey, aadOf(e, kdf));
    }
  } catch (err) {
    if (err instanceof BackupFormatError) throw err;
    if (err instanceof BackupDecryptError) {
      throw kdf.name === 'argon2id'
        ? new BackupFormatError(err.message, 'contrasena')
        : new BackupFormatError('No se puede abrir con la clave de este equipo: la copia es de otro equipo o está dañada.', 'equipo');
    }
    throw new BackupFormatError('La copia está dañada.', 'datos');
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new BackupFormatError('La copia está dañada.', 'datos');
  }
}
