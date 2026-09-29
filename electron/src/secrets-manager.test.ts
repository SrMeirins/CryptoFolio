import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { SecretsManager } from './secrets-manager';

describe('SecretsManager — bootstrap de WALLET_SYNC_ENCRYPTION_KEY para Electron', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cryptofolio-secrets-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('genera una clave nueva en el primer arranque, 32 bytes reales en base64 (formato AES-256)', () => {
    const mgr = new SecretsManager(tmpDir);
    mgr.loadOrCreate();

    const key = mgr.walletSyncEncryptionKey;
    expect(key).toBeTruthy();
    // Mismo check que hace el backend real (apiKeyCrypto.ts:loadMasterKey)
    expect(Buffer.from(key, 'base64').length).toBe(32);
  });

  it('persiste el fichero de config con permisos 0o600 (solo el dueño puede leer/escribir)', () => {
    const mgr = new SecretsManager(tmpDir);
    mgr.loadOrCreate();

    const configPath = path.join(tmpDir, 'electron-secrets.json');
    expect(fs.existsSync(configPath)).toBe(true);
    const mode = fs.statSync(configPath).mode & 0o777;
    expect(mode).toBe(0o600);
  });

  it('reutiliza la MISMA clave en arranques posteriores (no regenera cada vez)', () => {
    const mgr1 = new SecretsManager(tmpDir);
    mgr1.loadOrCreate();
    const firstKey = mgr1.walletSyncEncryptionKey;

    // Simula un segundo arranque de la app: nueva instancia, mismo directorio.
    const mgr2 = new SecretsManager(tmpDir);
    mgr2.loadOrCreate();
    const secondKey = mgr2.walletSyncEncryptionKey;

    expect(secondKey).toBe(firstKey);
  });

  it('genera claves distintas para directorios distintos (no hay una clave global compartida)', () => {
    const otherDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cryptofolio-secrets-test-2-'));
    try {
      const mgr1 = new SecretsManager(tmpDir);
      mgr1.loadOrCreate();
      const mgr2 = new SecretsManager(otherDir);
      mgr2.loadOrCreate();

      expect(mgr1.walletSyncEncryptionKey).not.toBe(mgr2.walletSyncEncryptionKey);
    } finally {
      fs.rmSync(otherDir, { recursive: true, force: true });
    }
  });
});
