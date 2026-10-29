import { describe, expect, it } from 'vitest';
import { BackupDecryptError, KDF_LIMITS, kdfWithinLimits, open, seal, type Sealed } from './backupCrypto';

// Parámetros mínimos admitidos, para que los tests vayan rápidos.
const FAST = { memory: KDF_LIMITS.memory[0], iterations: KDF_LIMITS.iterations[0], parallelism: 1 };
const AAD = () => 'cabecera';

function flip(b64: string): string {
  const buf = Buffer.from(b64, 'base64');
  buf[0] ^= 0x01;
  return buf.toString('base64');
}

describe('backupCrypto (#453)', () => {
  it('ida y vuelta: lo cifrado se descifra con la misma contraseña', async () => {
    const sealed = await seal('{"datos":"sinteticos"}', 'contrasena-larga', AAD, FAST);
    expect(sealed.payload).not.toContain('sinteticos');
    expect(await open(sealed, 'contrasena-larga', AAD())).toBe('{"datos":"sinteticos"}');
  });

  it('con otra contraseña no se descifra', async () => {
    const sealed = await seal('secreto', 'contrasena-larga', AAD, FAST);
    await expect(open(sealed, 'otra-contrasena', AAD())).rejects.toBeInstanceOf(BackupDecryptError);
  });

  it('una etiqueta GCM, un dato cifrado o una cabecera manipulados se rechazan', async () => {
    const sealed = await seal('secreto', 'contrasena-larga', AAD, FAST);
    const casos: Sealed[] = [
      { ...sealed, cipher: { ...sealed.cipher, tag: flip(sealed.cipher.tag) } },
      { ...sealed, payload: flip(sealed.payload) },
      { ...sealed, cipher: { ...sealed.cipher, iv: flip(sealed.cipher.iv) } },
      { ...sealed, kdf: { ...sealed.kdf, salt: flip(sealed.kdf.salt) } },
    ];
    for (const c of casos) await expect(open(c, 'contrasena-larga', AAD())).rejects.toBeInstanceOf(BackupDecryptError);
    await expect(open(sealed, 'contrasena-larga', 'otra cabecera')).rejects.toBeInstanceOf(BackupDecryptError);
  });

  it('cada copia lleva sal y nonce nuevos aunque el contenido y la contraseña se repitan', async () => {
    const a = await seal('igual', 'contrasena-larga', AAD, FAST);
    const b = await seal('igual', 'contrasena-larga', AAD, FAST);
    expect(a.cipher.iv).not.toBe(b.cipher.iv);
    expect(a.kdf.salt).not.toBe(b.kdf.salt);
    expect(a.payload).not.toBe(b.payload);
    expect(Buffer.from(a.cipher.iv, 'base64')).toHaveLength(12);
  });

  it('la AAD recibe los parámetros de la clave con la sal elegida', async () => {
    let visto = '';
    const sealed = await seal('x', 'contrasena-larga', kdf => (visto = kdf.salt), FAST);
    expect(visto).toBe(sealed.kdf.salt);
  });

  it('rechaza parámetros de coste fuera de límites sin intentar derivar la clave', async () => {
    expect(kdfWithinLimits({ memory: 1024 * 1024 * 4, iterations: 3, parallelism: 1 })).toBe(false);
    expect(kdfWithinLimits({ memory: 64 * 1024, iterations: 1, parallelism: 1 })).toBe(false);
    expect(kdfWithinLimits({ memory: 64 * 1024, iterations: 3, parallelism: 1 })).toBe(true);
    const sealed = await seal('x', 'contrasena-larga', AAD, FAST);
    await expect(open({ ...sealed, kdf: { ...sealed.kdf, memory: 4 * 1024 * 1024 } }, 'contrasena-larga', AAD()))
      .rejects.toBeInstanceOf(BackupDecryptError);
  });
});
