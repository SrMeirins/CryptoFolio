import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'crypto';
import { argon2id } from 'hash-wasm';

// Cifrado de las copias (#453): la clave sale de la contraseña con Argon2id
// (hash-wasm, sin dependencias nativas) y los datos se cifran con AES-256-GCM.
// La contraseña no se guarda en ningún sitio. Sal y nonce son aleatorios y
// nuevos en cada copia; la cabecera de la copia va como datos asociados (AAD),
// así que cambiar la versión o los parámetros también invalida la etiqueta.

export interface KdfParams {
  name: 'argon2id';
  salt: string;        // base64
  memory: number;      // KiB
  iterations: number;
  parallelism: number;
}

export interface CipherParams {
  name: 'aes-256-gcm';
  iv: string;          // base64, 12 bytes
  tag: string;         // base64, 16 bytes
}

export interface Sealed { kdf: KdfParams; cipher: CipherParams; payload: string }

// Por encima del mínimo de OWASP (19 MiB, 2 pasadas). Los límites de abajo
// evitan que una copia manipulada pida memoria o tiempo desmedidos.
export const KDF_DEFAULTS = { memory: 64 * 1024, iterations: 3, parallelism: 1 } as const;
export const KDF_LIMITS = { memory: [19 * 1024, 256 * 1024], iterations: [2, 10], parallelism: [1, 4] } as const;

export const MIN_PASSWORD_LENGTH = 8;

/** Error de contraseña incorrecta o copia manipulada: no se distinguen a propósito. */
export class BackupDecryptError extends Error {
  constructor() { super('Contraseña incorrecta o copia dañada'); }
}

async function deriveKey(password: string, salt: Buffer, p: Omit<KdfParams, 'name' | 'salt'>): Promise<Buffer> {
  const key = await argon2id({
    password, salt,
    memorySize: p.memory, iterations: p.iterations, parallelism: p.parallelism,
    hashLength: 32, outputType: 'binary',
  });
  return Buffer.from(key);
}

function within(n: number, [min, max]: readonly [number, number]): boolean {
  return Number.isInteger(n) && n >= min && n <= max;
}

export function kdfWithinLimits(k: Omit<KdfParams, 'name' | 'salt'>): boolean {
  return within(k.memory, KDF_LIMITS.memory) && within(k.iterations, KDF_LIMITS.iterations) && within(k.parallelism, KDF_LIMITS.parallelism);
}

// AES-256-GCM con una clave ya derivada: lo comparten la contraseña y la clave del equipo.
function encrypt(plaintext: string, key: Buffer, aad: string): { cipher: CipherParams; payload: string } {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(aad, 'utf8'));
  const payload = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return {
    cipher: { name: 'aes-256-gcm', iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64') },
    payload: payload.toString('base64'),
  };
}

function decrypt(cipherParams: CipherParams, payload: string, key: Buffer, aad: string): string {
  const iv = Buffer.from(cipherParams.iv, 'base64');
  const tag = Buffer.from(cipherParams.tag, 'base64');
  if (iv.length !== 12 || tag.length !== 16) throw new BackupDecryptError();
  const decipher = createDecipheriv('aes-256-gcm', key, iv, { authTagLength: 16 });
  decipher.setAAD(Buffer.from(aad, 'utf8'));
  decipher.setAuthTag(tag);
  try {
    return Buffer.concat([decipher.update(Buffer.from(payload, 'base64')), decipher.final()]).toString('utf8');
  } catch {
    throw new BackupDecryptError();
  }
}

/** Cifra `plaintext`. `aadFor` recibe los parámetros de la clave (con la sal nueva) y da la AAD. */
export async function seal(plaintext: string, password: string, aadFor: (kdf: KdfParams) => string,
  params: Omit<KdfParams, 'name' | 'salt'> = KDF_DEFAULTS): Promise<Sealed> {
  const salt = randomBytes(16);
  const kdf: KdfParams = { name: 'argon2id', salt: salt.toString('base64'), ...params };
  const key = await deriveKey(password, salt, params);
  return { kdf, ...encrypt(plaintext, key, aadFor(kdf)) };
}

export async function open(sealed: Sealed, password: string, aad: string): Promise<string> {
  const salt = Buffer.from(sealed.kdf.salt, 'base64');
  if (salt.length < 16 || !kdfWithinLimits(sealed.kdf)) throw new BackupDecryptError();
  const key = await deriveKey(password, salt, sealed.kdf);
  return decrypt(sealed.cipher, sealed.payload, key, aad);
}

// ── Clave del equipo (#454) ──────────────────────────────────────────────
// Las copias automáticas no piden contraseña: se cifran con una clave
// derivada (HKDF-SHA256, contexto propio) de WALLET_SYNC_ENCRYPTION_KEY, la
// misma que protege las claves de API. Sin ella no se hacen copias
// automáticas (nunca se escriben en claro).

export const MACHINE_KEY_INFO = 'cryptofolio:copias-automaticas:v1';

export interface MachineKdf { name: 'equipo'; info: typeof MACHINE_KEY_INFO }
export interface MachineSealed { kdf: MachineKdf; cipher: CipherParams; payload: string }

/** Clave del equipo, o null si WALLET_SYNC_ENCRYPTION_KEY falta o no mide 32 bytes. */
export function machineKey(env: string | undefined = process.env.WALLET_SYNC_ENCRYPTION_KEY): Buffer | null {
  if (!env) return null;
  const ikm = Buffer.from(env, 'base64');
  if (ikm.length !== 32) return null;
  return Buffer.from(hkdfSync('sha256', ikm, Buffer.alloc(0), MACHINE_KEY_INFO, 32));
}

export function sealWithKey(plaintext: string, key: Buffer, aadFor: (kdf: MachineKdf) => string): MachineSealed {
  const kdf: MachineKdf = { name: 'equipo', info: MACHINE_KEY_INFO };
  return { kdf, ...encrypt(plaintext, key, aadFor(kdf)) };
}

export function openWithKey(sealed: MachineSealed, key: Buffer, aad: string): string {
  return decrypt(sealed.cipher, sealed.payload, key, aad);
}
