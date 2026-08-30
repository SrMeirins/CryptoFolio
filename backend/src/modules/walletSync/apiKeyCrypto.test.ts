import { describe, expect, it, beforeAll } from 'vitest';
import { randomBytes } from 'crypto';
import { encryptApiKey, decryptApiKey } from './apiKeyCrypto';

beforeAll(() => {
  process.env.WALLET_SYNC_ENCRYPTION_KEY = randomBytes(32).toString('base64');
});

describe('apiKeyCrypto', () => {
  it('round-trip: cifrar y descifrar devuelve el valor original', () => {
    const plaintext = 'ETHERSCAN_API_KEY_DE_PRUEBA_12345';
    const { encrypted, iv } = encryptApiKey(plaintext);
    expect(decryptApiKey(encrypted, iv)).toBe(plaintext);
  });

  it('IVs distintos en cada llamada, aunque el texto plano sea el mismo', () => {
    const a = encryptApiKey('misma-key');
    const b = encryptApiKey('misma-key');
    expect(a.iv.equals(b.iv)).toBe(false);
    expect(a.encrypted.equals(b.encrypted)).toBe(false);
  });

  it('lanza si falta WALLET_SYNC_ENCRYPTION_KEY', () => {
    const saved = process.env.WALLET_SYNC_ENCRYPTION_KEY;
    delete process.env.WALLET_SYNC_ENCRYPTION_KEY;
    expect(() => encryptApiKey('x')).toThrow();
    process.env.WALLET_SYNC_ENCRYPTION_KEY = saved;
  });

  it('lanza al descifrar si el authTag no coincide (datos corrompidos)', () => {
    const { encrypted, iv } = encryptApiKey('valor-original');
    const corrupted = Buffer.from(encrypted);
    corrupted[0] ^= 0xff;
    expect(() => decryptApiKey(corrupted, iv)).toThrow();
  });
});
