import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { BackupManager } from './backup-manager';

describe('BackupManager — backup automático semanal de la app de escritorio', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cryptofolio-backup-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    vi.useRealTimers();
  });

  it('escribe un backup con los datos que devuelve fetchBackupData, con permisos 0o600', async () => {
    const backupDir = path.join(tmpDir, 'backups');
    const fakeData = { version: '1.0', transactions: [{ id: 1 }] };
    const mgr = new BackupManager(backupDir, async () => fakeData);

    const file = await mgr.runBackupNow();

    expect(fs.existsSync(file)).toBe(true);
    expect(JSON.parse(fs.readFileSync(file, 'utf8'))).toEqual(fakeData);
    const mode = fs.statSync(file).mode & 0o777;
    expect(mode).toBe(0o600);
  });

  it('crea el directorio de backups si no existe', async () => {
    const backupDir = path.join(tmpDir, 'no-existe-todavia', 'backups');
    const mgr = new BackupManager(backupDir, async () => ({}));

    await mgr.runBackupNow();

    expect(fs.existsSync(backupDir)).toBe(true);
  });

  it('respeta la retención: borra los backups más antiguos por encima del límite', async () => {
    const backupDir = path.join(tmpDir, 'backups');
    fs.mkdirSync(backupDir, { recursive: true });
    // 5 backups previos simulados, con mtimes distintos y separados
    for (let i = 0; i < 5; i++) {
      const f = path.join(backupDir, `cryptofolio_old-${i}.json`);
      fs.writeFileSync(f, '{}');
      const t = new Date(Date.now() - (5 - i) * 60_000);
      fs.utimesSync(f, t, t);
    }
    const mgr = new BackupManager(backupDir, async () => ({}), undefined, 3);

    await mgr.runBackupNow(); // ahora hay 6 backups, retención = 3

    const remaining = fs.readdirSync(backupDir).filter((f) => f.startsWith('cryptofolio_'));
    expect(remaining).toHaveLength(3);
  });

  it('no confunde ficheros ajenos del mismo directorio con backups propios al aplicar retención', async () => {
    const backupDir = path.join(tmpDir, 'backups');
    fs.mkdirSync(backupDir, { recursive: true });
    fs.writeFileSync(path.join(backupDir, 'otro-fichero.txt'), 'no soy un backup');
    const mgr = new BackupManager(backupDir, async () => ({}), undefined, 1);

    await mgr.runBackupNow();

    expect(fs.existsSync(path.join(backupDir, 'otro-fichero.txt'))).toBe(true);
  });

  it('start() ejecuta un backup inmediato y luego uno periódico según intervalMs', async () => {
    vi.useFakeTimers();
    const backupDir = path.join(tmpDir, 'backups');
    let calls = 0;
    const mgr = new BackupManager(backupDir, async () => { calls++; return {}; }, 1000, 14);

    mgr.start();
    await vi.advanceTimersByTimeAsync(0); // deja resolver el backup inicial (fire-and-forget)
    expect(calls).toBe(1);

    await vi.advanceTimersByTimeAsync(1000);
    expect(calls).toBe(2);

    mgr.stop();
    await vi.advanceTimersByTimeAsync(5000);
    expect(calls).toBe(2); // tras stop() no debe seguir corriendo
  });

  it('un fallo en fetchBackupData no lanza sin capturar (start() lo registra y sigue)', async () => {
    vi.useFakeTimers();
    const backupDir = path.join(tmpDir, 'backups');
    const mgr = new BackupManager(backupDir, async () => { throw new Error('red caída'); }, 1000, 14);

    expect(() => mgr.start()).not.toThrow();
    await vi.advanceTimersByTimeAsync(0);
    mgr.stop();
  });
});
