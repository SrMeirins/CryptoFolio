import { readdirSync } from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { BACKUP_FORMAT, BACKUP_SCHEMA, BackupFormatError, buildBackup, openBackup, validatePassword } from './backupEnvelope';
import { BACKUP_TABLE_NAMES, type BackupData } from './backupTables';

// Datos sintéticos mínimos: una wallet y un ajuste.
function sample(): BackupData {
  const data = Object.fromEntries(BACKUP_TABLE_NAMES.map(t => [t, []])) as unknown as BackupData;
  data.wallets = [{ id: '00000000-0000-4000-8000-000000000001', name: 'Wallet sintética', type: 'hardware' }];
  data.app_config = [{ key: 'theme', value: 'dark' }];
  return data;
}

async function codeOf(p: Promise<unknown>): Promise<string> {
  try { await p; return 'ok'; } catch (e) { return e instanceof BackupFormatError ? e.code : 'otro'; }
}

describe('backupEnvelope (#453)', () => {
  it('la versión de datos coincide con la última migración', () => {
    const dir = path.join(__dirname, '../../db/migrations');
    const last = Math.max(...readdirSync(dir).filter(f => /^\d{3}_.+\.sql$/.test(f)).map(f => parseInt(f.slice(0, 3), 10)));
    expect(BACKUP_SCHEMA).toBe(last);
  });

  it('sin contraseña: copia en claro con recuento, que se lee igual', async () => {
    const file = await buildBackup(sample(), undefined, new Date('2026-01-02T03:04:05Z'));
    expect(file).toMatchObject({ format: BACKUP_FORMAT, schema: BACKUP_SCHEMA, encrypted: false, exported_at: '2026-01-02T03:04:05.000Z' });
    const opened = await openBackup(JSON.parse(JSON.stringify(file)));
    expect(opened.counts.wallets).toBe(1);
    expect(opened.data.app_config).toEqual([{ key: 'theme', value: 'dark' }]);
  });

  it('con contraseña: no deja nada legible y solo se abre con ella', async () => {
    const file = JSON.parse(JSON.stringify(await buildBackup(sample(), 'contrasena-larga')));
    expect(JSON.stringify(file)).not.toContain('sintética');
    expect(file.data).toBeUndefined();
    expect(file.counts).toBeUndefined();
    expect(await codeOf(openBackup(file))).toBe('contrasena');
    expect(await codeOf(openBackup(file, 'otra-contrasena'))).toBe('contrasena');
    expect((await openBackup(file, 'contrasena-larga')).data.wallets[0].name).toBe('Wallet sintética');
  });

  it('cambiar la cabecera de una copia cifrada invalida la etiqueta', async () => {
    const file = JSON.parse(JSON.stringify(await buildBackup(sample(), 'contrasena-larga')));
    expect(await codeOf(openBackup({ ...file, exported_at: '2020-01-01T00:00:00.000Z' }, 'contrasena-larga'))).toBe('contrasena');
    expect(await codeOf(openBackup({ ...file, schema: 1 }, 'contrasena-larga'))).toBe('contrasena');
  });

  it('rechaza una versión más nueva, el formato anterior y ficheros ajenos', async () => {
    const file = JSON.parse(JSON.stringify(await buildBackup(sample())));
    expect(await codeOf(openBackup({ ...file, schema: BACKUP_SCHEMA + 1 }))).toBe('version');
    expect(await codeOf(openBackup({ version: '1.0', transactions: [] }))).toBe('formato');
    expect(await codeOf(openBackup({ hola: 'mundo' }))).toBe('formato');
    expect(await codeOf(openBackup(null))).toBe('formato');
  });

  it('acepta una copia de una versión anterior', async () => {
    const file = JSON.parse(JSON.stringify(await buildBackup(sample())));
    expect(await codeOf(openBackup({ ...file, schema: BACKUP_SCHEMA - 1 }))).toBe('ok');
  });

  it('rechaza tablas desconocidas o filas que no son objetos', async () => {
    const file = JSON.parse(JSON.stringify(await buildBackup(sample())));
    expect(await codeOf(openBackup({ ...file, data: { ...file.data, network_api_keys: [] } }))).toBe('datos');
    expect(await codeOf(openBackup({ ...file, data: { ...file.data, wallets: ['texto'] } }))).toBe('datos');
  });

  it('exige al menos 8 caracteres de contraseña', () => {
    expect(validatePassword(undefined)).toBeNull();
    expect(validatePassword('corta')).toMatch(/8 caracteres/);
    expect(validatePassword('suficiente')).toBeNull();
  });
});
