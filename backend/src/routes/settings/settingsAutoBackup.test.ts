import { describe, expect, it, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { Pool } from 'pg';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { randomBytes } from 'crypto';
import { createTestDatabase, TestDatabase } from '../../test/setup-test-db';

// Copias automáticas (#454) contra una base aislada y una carpeta temporal,
// con datos sintéticos. El FIFO se sustituye: solo importa que se lance.
const { runFifoEngineMock } = vi.hoisted(() => ({ runFifoEngineMock: vi.fn(() => Promise.resolve({})) }));
vi.mock('../../modules/fifo/engine', () => ({ runFifoEngine: runFifoEngineMock }));

let testDb: TestDatabase;
let pool: Pool;
let app: import('express').Express;
let dir: string;
let auto: typeof import('../../modules/backup/autoBackup');

async function names(): Promise<string[]> {
  return (await fs.readdir(dir)).filter(n => n.startsWith('cryptofolio-auto-')).sort();
}

describe('routes/settings — copias automáticas (#454)', () => {
  beforeAll(async () => {
    testDb = await createTestDatabase();
    process.env.DATABASE_URL = testDb.connectionString;
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cf-auto-api-'));
    process.env.AUTO_BACKUP_DIR = dir;
    process.env.WALLET_SYNC_ENCRYPTION_KEY = randomBytes(32).toString('base64');
    pool = new Pool({ connectionString: testDb.connectionString });
    await pool.query(`INSERT INTO wallets (name, type) VALUES ('Wallet automática sintética', 'hardware')`);
    auto = await import('../../modules/backup/autoBackup');
    const { default: router } = await import('./settingsAutoBackup');
    app = express();
    app.use(express.json());
    app.use('/api/settings', router);
  });

  beforeEach(() => auto.resetAutoBackupState());

  afterAll(async () => {
    await pool.end();
    await fs.rm(dir, { recursive: true, force: true });
    if (testDb) await testDb.teardown();
  });

  it('hace una copia cifrada con la clave del equipo, sin datos legibles', async () => {
    const res = await request(app).post('/api/settings/backup/auto/run');
    expect(res.status).toBe(200);
    const [name] = await names();
    expect(res.body.name).toBe(name);
    const text = await fs.readFile(path.join(dir, name), 'utf8');
    expect(text).not.toContain('sintética');
    expect(JSON.parse(text)).toMatchObject({ encrypted: true, kdf: { name: 'equipo' } });
  });

  it('la rotación conserva exactamente las N últimas', async () => {
    await pool.query(`INSERT INTO app_config (key, value) VALUES ('auto_backup_keep', '3') ON CONFLICT (key) DO UPDATE SET value = '3'`);
    for (const d of [1, 2, 3, 4, 5]) await auto.runAutoBackup(new Date(`2025-12-0${d}T10:00:00Z`));
    // Quedan la de la primera prueba (fecha actual) y las de los días 5 y 4.
    expect((await names()).slice(0, 2)).toEqual(['cryptofolio-auto-20251204-100000.json', 'cryptofolio-auto-20251205-100000.json']);
    expect(await names()).toHaveLength(3);
    const res = await request(app).get('/api/settings/backup/auto');
    expect(res.body.files).toHaveLength(3);
    expect(res.body.settings).toEqual({ enabled: true, frequencyHours: 24, keep: 3 });
    expect(JSON.stringify(res.body)).not.toContain(dir);
  });

  it('solo hace la copia si toca, y no si están desactivadas', async () => {
    const [newest] = (await request(app).get('/api/settings/backup/auto')).body.files;
    const justAfter = new Date(new Date(newest.created_at).getTime() + 60_000);
    expect(await auto.runAutoBackupIfDue(justAfter)).toBe(false);
    await pool.query(`INSERT INTO app_config (key, value) VALUES ('auto_backup_enabled', 'false') ON CONFLICT (key) DO UPDATE SET value = 'false'`);
    expect(await auto.runAutoBackupIfDue(new Date('2099-01-01T00:00:00Z'))).toBe(false);
    await pool.query(`UPDATE app_config SET value = 'true' WHERE key = 'auto_backup_enabled'`);
  });

  it('una copia fallida avisa y no borra las anteriores', async () => {
    const before = await names();
    await fs.chmod(dir, 0o500);
    try {
      const res = await request(app).post('/api/settings/backup/auto/run');
      // Como root (algunos CI) los permisos no impiden escribir: entonces la copia sale bien.
      if (res.status === 500) {
        expect(res.body.error).toBe('Sin permiso para escribir en la carpeta de copias.');
        expect(auto.lastAutoBackupFailure()).not.toBeNull();
        expect((await request(app).get('/api/settings/backup/auto')).body.lastFailure.message).toMatch(/Sin permiso/);
      }
    } finally {
      await fs.chmod(dir, 0o700);
    }
    for (const n of before) expect(await names()).toContain(n);
  });

  it('descarga recifrada: se abre con la contraseña y no con la clave del equipo', async () => {
    const [name] = (await request(app).get('/api/settings/backup/auto')).body.files.map((f: { name: string }) => f.name);
    const corta = await request(app).post(`/api/settings/backup/auto/${name}/download`).send({ password: 'corta' });
    expect(corta.status).toBe(400);
    const res = await request(app).post(`/api/settings/backup/auto/${name}/download`).send({ password: 'contrasena-larga' });
    expect(res.status).toBe(200);
    expect(res.body.kdf.name).toBe('argon2id');
    const { openBackup } = await import('../../modules/backup/backupEnvelope');
    const { machineKey } = await import('../../modules/backup/backupCrypto');
    expect((await openBackup(res.body, { password: 'contrasena-larga' })).data.wallets.some(w => w.name === 'Wallet automática sintética')).toBe(true);
    await expect(openBackup(res.body, { machineKey: machineKey() })).rejects.toMatchObject({ code: 'contrasena' });
  });

  it('restaurar exige confirmación, guarda el estado previo y recalcula el FIFO', async () => {
    const [name] = (await request(app).get('/api/settings/backup/auto')).body.files.map((f: { name: string }) => f.name);
    expect((await request(app).post(`/api/settings/backup/auto/${name}/restore`).send({})).status).toBe(400);
    runFifoEngineMock.mockClear();
    const res = await request(app).post(`/api/settings/backup/auto/${name}/restore`).send({ confirm: true });
    expect(res.status).toBe(200);
    expect(res.body.snapshotId).toBeTruthy();
    expect(runFifoEngineMock).toHaveBeenCalledOnce();
    expect(Number((await pool.query('SELECT COUNT(*) FROM backup_snapshots')).rows[0].count)).toBe(1);
  });

  it('nombres inválidos o inexistentes no tocan el disco', async () => {
    expect((await request(app).post('/api/settings/backup/auto/..%2F..%2Fetc%2Fpasswd/restore').send({ confirm: true })).status).toBe(400);
    expect((await request(app).post('/api/settings/backup/auto/cryptofolio-auto-20000101-000000.json/restore').send({ confirm: true })).status).toBe(404);
  });

  it('sin clave del equipo no se hacen copias', async () => {
    const key = process.env.WALLET_SYNC_ENCRYPTION_KEY;
    delete process.env.WALLET_SYNC_ENCRYPTION_KEY;
    try {
      const res = await request(app).post('/api/settings/backup/auto/run');
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('sin-clave');
      expect((await request(app).get('/api/settings/backup/auto')).body).toMatchObject({ available: false, reason: 'sin-clave', files: [] });
    } finally {
      process.env.WALLET_SYNC_ENCRYPTION_KEY = key;
    }
  });
});
