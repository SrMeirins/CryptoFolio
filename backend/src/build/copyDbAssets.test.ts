import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readdirSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { copyDbAssets } = require('../../scripts/copy-db-assets.js') as { copyDbAssets: (root: string) => number };

// Copia multiplataforma de los SQL a dist/ (#114, #205): sin mkdir/cp/find, que
// rompían el build de Windows.
let root: string;
afterEach(() => { if (root) rmSync(root, { recursive: true, force: true }); });

describe('copyDbAssets', () => {
  it('copia schema.sql y solo los .sql de primer nivel de migrations/', () => {
    root = mkdtempSync(path.join(tmpdir(), 'cf-db-assets-'));
    const migrations = path.join(root, 'src', 'db', 'migrations');
    mkdirSync(path.join(migrations, 'subcarpeta'), { recursive: true });
    writeFileSync(path.join(root, 'src', 'db', 'schema.sql'), 'CREATE TABLE x();');
    writeFileSync(path.join(migrations, '001_a.sql'), 'SELECT 1;');
    writeFileSync(path.join(migrations, '002_b.sql'), 'SELECT 2;');
    writeFileSync(path.join(migrations, 'notas.md'), 'no se copia');
    writeFileSync(path.join(migrations, 'subcarpeta', '003_c.sql'), 'no se copia');

    expect(copyDbAssets(root)).toBe(2);
    const dist = path.join(root, 'dist', 'db');
    expect(readFileSync(path.join(dist, 'schema.sql'), 'utf8')).toBe('CREATE TABLE x();');
    expect(readdirSync(path.join(dist, 'migrations')).sort()).toEqual(['001_a.sql', '002_b.sql']);
  });

  it('es idempotente: se puede ejecutar varias veces sobre el mismo dist/', () => {
    root = mkdtempSync(path.join(tmpdir(), 'cf-db-assets-'));
    mkdirSync(path.join(root, 'src', 'db', 'migrations'), { recursive: true });
    writeFileSync(path.join(root, 'src', 'db', 'schema.sql'), 'v1');
    copyDbAssets(root);
    writeFileSync(path.join(root, 'src', 'db', 'schema.sql'), 'v2');
    copyDbAssets(root);
    expect(readFileSync(path.join(root, 'dist', 'db', 'schema.sql'), 'utf8')).toBe('v2');
  });
});
