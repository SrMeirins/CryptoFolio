import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

function loadMasterKey(): Buffer {
  const b64 = process.env.WALLET_SYNC_ENCRYPTION_KEY;
  if (!b64) {
    throw new Error('WALLET_SYNC_ENCRYPTION_KEY no está definida — genera una con: openssl rand -base64 32');
  }
  const key = Buffer.from(b64, 'base64');
  if (key.length !== 32) {
    throw new Error('WALLET_SYNC_ENCRYPTION_KEY debe decodificar a 32 bytes (AES-256)');
  }
  return key;
}

// El authTag (16 bytes) se concatena al final del ciphertext — un único
// campo BYTEA en BD en vez de una tercera columna, sin perder verificación
// de integridad de GCM.
export function encryptApiKey(plaintext: string): { encrypted: Buffer; iv: Buffer } {
  const key = loadMasterKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return { encrypted: Buffer.concat([ciphertext, authTag]), iv };
}

export function decryptApiKey(encrypted: Buffer, iv: Buffer): string {
  const key = loadMasterKey();
  const authTag = encrypted.subarray(encrypted.length - AUTH_TAG_LENGTH);
  const ciphertext = encrypted.subarray(0, encrypted.length - AUTH_TAG_LENGTH);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}
