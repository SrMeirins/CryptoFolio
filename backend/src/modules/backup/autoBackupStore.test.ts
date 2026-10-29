import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  autoBackupName, autoBackupPath, dateFromName, listAutoBackups, namesToRotate, readAutoBackup, rotateAutoBackups, writeAutoBackup,
} from './autoBackupStore';
import { isDue } from './autoBackup';
import { parseAutoBackupSettings, autoBackupSchemas } from './autoBackupSettings';
import { noticesFor } from './autoBackupNotices';

// Ficheros, rotación y programación de las copias automáticas (#454), en una carpeta temporal.

let dir: string;
beforeEach(async () => { dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cf-auto-')); });
afterEach(async () => { await fs.rm(dir, { recursive: true, force: true }); });

const at = (iso: string) => new Date(iso);

describe('nombres', () => {
  it('el nombre lleva la fecha en UTC y se puede leer de vuelta', () => {
    const name = autoBackupName(at('2026-01-02T03:04:05.678Z'));
    expect(name).toBe('cryptofolio-auto-20260102-030405.json');
    expect(dateFromName(name)?.toISOString()).toBe('2026-01-02T03:04:05.000Z');
    expect(dateFromName('otro.json')).toBeNull();
    expect(dateFromName('cryptofolio-auto-20261399-030405.json')).toBeNull();
  });

  it('no deja salir de la carpeta ni abrir otros ficheros', () => {
    expect(autoBackupPath(dir, '../cryptofolio-auto-20260102-030405.json')).toBeNull();
    expect(autoBackupPath(dir, '/etc/passwd')).toBeNull();
    expect(autoBackupPath(dir, 'notas.txt')).toBeNull();
    expect(autoBackupPath(dir, 'cryptofolio-auto-20260102-030405.json')).toBe(path.join(dir, 'cryptofolio-auto-20260102-030405.json'));
  });
});

describe('rotación', () => {
  it('conserva exactamente las N más recientes e ignora otros ficheros', () => {
    const names = ['notas.txt', ...[1, 2, 3, 4, 5].map(d => autoBackupName(at(`2026-01-0${d}T10:00:00Z`)))];
    expect(namesToRotate(names, 3)).toEqual([autoBackupName(at('2026-01-02T10:00:00Z')), autoBackupName(at('2026-01-01T10:00:00Z'))]);
    expect(namesToRotate(names, 10)).toEqual([]);
  });

  it('en disco: carpeta 700, ficheros 600, lista de más nueva a más antigua y rotación', async () => {
    const sub = path.join(dir, 'app');
    for (const d of [1, 2, 3, 4]) await writeAutoBackup(sub, autoBackupName(at(`2026-01-0${d}T10:00:00Z`)), `{"n":${d}}`);
    await fs.writeFile(path.join(sub, 'ajeno.json'), '{}');
    expect((await fs.stat(sub)).mode & 0o777).toBe(0o700);
    expect((await fs.stat(path.join(sub, autoBackupName(at('2026-01-01T10:00:00Z'))))).mode & 0o777).toBe(0o600);

    const files = await listAutoBackups(sub);
    expect(files.map(f => f.created_at)).toEqual(['2026-01-04T10:00:00.000Z', '2026-01-03T10:00:00.000Z', '2026-01-02T10:00:00.000Z', '2026-01-01T10:00:00.000Z']);
    expect(files[0].size).toBe(7);

    expect(await rotateAutoBackups(sub, 2)).toHaveLength(2);
    expect((await listAutoBackups(sub)).map(f => f.name)).toEqual([autoBackupName(at('2026-01-04T10:00:00Z')), autoBackupName(at('2026-01-03T10:00:00Z'))]);
    expect(await fs.readFile(path.join(sub, 'ajeno.json'), 'utf8')).toBe('{}');
    expect(await readAutoBackup(sub, autoBackupName(at('2026-01-04T10:00:00Z')))).toBe('{"n":4}');
    expect(await readAutoBackup(sub, autoBackupName(at('2026-01-01T10:00:00Z')))).toBeNull();
  });

  it('una carpeta que no existe da una lista vacía; una escritura fallida no deja temporales', async () => {
    expect(await listAutoBackups(path.join(dir, 'no-existe'))).toEqual([]);
    const name = autoBackupName(at('2026-01-01T10:00:00Z'));
    await writeAutoBackup(dir, name, '{}');
    await expect(writeAutoBackup(dir, name, '{"otra":1}')).resolves.toBeUndefined();
    // El mismo nombre se sustituye de forma atómica; nada de .tmp sueltos.
    expect((await fs.readdir(dir)).filter(n => n.endsWith('.tmp'))).toEqual([]);
  });
});

describe('programación', () => {
  it('toca sin copias previas o cuando ha pasado la frecuencia', () => {
    const now = at('2026-01-02T10:00:00Z');
    expect(isDue(null, now, 24)).toBe(true);
    expect(isDue(at('2026-01-01T10:00:00Z'), now, 24)).toBe(true);
    expect(isDue(at('2026-01-01T10:00:01Z'), now, 24)).toBe(false);
    expect(isDue(at('2026-01-02T00:00:00Z'), now, 12)).toBe(false);
    expect(isDue(at('2025-12-26T10:00:00Z'), now, 168)).toBe(true);
  });
});

describe('ajustes', () => {
  it('por defecto: activadas, diarias y 7; un valor inválido cuenta como el de por defecto', () => {
    expect(parseAutoBackupSettings({})).toEqual({ enabled: true, frequencyHours: 24, keep: 7 });
    expect(parseAutoBackupSettings({ auto_backup_enabled: 'false', auto_backup_frequency: '168', auto_backup_keep: '30' }))
      .toEqual({ enabled: false, frequencyHours: 168, keep: 30 });
    expect(parseAutoBackupSettings({ auto_backup_enabled: 'quizá', auto_backup_frequency: '1', auto_backup_keep: '99' }))
      .toEqual({ enabled: true, frequencyHours: 24, keep: 7 });
  });

  it('el PUT solo admite valores cerrados', () => {
    expect(autoBackupSchemas.auto_backup_keep.safeParse('2').success).toBe(false);
    expect(autoBackupSchemas.auto_backup_keep.safeParse('3').success).toBe(true);
    expect(autoBackupSchemas.auto_backup_frequency.safeParse('48').success).toBe(false);
  });
});

describe('avisos', () => {
  const ok = { available: true as const, dir, key: Buffer.alloc(32) };
  it('avisa si no se pueden hacer o si la última falló; nada si están desactivadas', () => {
    expect(noticesFor(true, { available: false, reason: 'sin-clave' }, null)[0]).toMatchObject({ id: 'backup-unavailable', category: 'Copias' });
    expect(noticesFor(true, ok, { at: '2026-01-01T00:00:00Z', message: 'No queda espacio en el disco.' })[0])
      .toMatchObject({ id: 'backup-failed', type: 'error', message: expect.stringContaining('Las anteriores se conservan') });
    expect(noticesFor(true, ok, null)).toEqual([]);
    expect(noticesFor(false, { available: false, reason: 'sin-carpeta' }, null)).toEqual([]);
  });
});
