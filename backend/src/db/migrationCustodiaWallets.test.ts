import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { Pool } from 'pg';
import { createTestDatabase, TestDatabase } from '../test/setup-test-db';

// Migración 026 (#545): custodia de las wallets de exchange indicada por el usuario.
const up = readFileSync(path.join(__dirname, 'migrations/026_custodia_wallets.sql'), 'utf8');
const down = readFileSync(path.join(__dirname, 'migrations/down/026_custodia_wallets.sql'), 'utf8');

let testDb: TestDatabase;
let pool: Pool;
let w: string;

const tabla = async () => (await pool.query(`SELECT to_regclass('wallet_custodia') AS t`)).rows[0].t;
const fila = (desde: string | null, enEspana: boolean, pais: string | null = null) => pool.query(
  'INSERT INTO wallet_custodia (wallet_id, desde, en_espana, entidad_pais) VALUES ($1, $2, $3, $4)', [w, desde, enEspana, pais]);

describe('migración 026_custodia_wallets', () => {
  beforeAll(async () => {
    testDb = await createTestDatabase();
    pool = new Pool({ connectionString: testDb.connectionString });
    w = (await pool.query(`SELECT id FROM wallets WHERE type = 'exchange' LIMIT 1`)).rows[0].id;
  }, 30000);

  afterAll(async () => {
    await pool.end();
    if (testDb) await testDb.teardown();
  });

  it('es idempotente', async () => {
    await pool.query(up);
    await pool.query(up);
    expect(await tabla()).toBe('wallet_custodia');
  });

  it('una sola fila por wallet y fecha, y una sola «desde siempre»', async () => {
    await fila(null, false);
    await expect(fila(null, true)).rejects.toThrow();
    await fila('2022-07-07', true);
    await expect(fila('2022-07-07', false)).rejects.toThrow();
  });

  it('el país de la entidad tiene que cuadrar con «en España»', async () => {
    await expect(fila('2023-01-01', false, 'ES')).rejects.toThrow();
    await expect(fila('2023-01-01', true, 'MT')).rejects.toThrow();
    await expect(fila('2023-01-01', false, 'esp')).rejects.toThrow();
    await fila('2023-01-01', false, 'MT');
  });

  it('borrar la wallet borra su custodia', async () => {
    const nueva = (await pool.query(`INSERT INTO wallets (name, type) VALUES ('Sintética', 'exchange') RETURNING id`)).rows[0].id;
    await pool.query('INSERT INTO wallet_custodia (wallet_id, en_espana) VALUES ($1, false)', [nueva]);
    await pool.query('DELETE FROM wallets WHERE id = $1', [nueva]);
    expect((await pool.query('SELECT count(*)::int AS n FROM wallet_custodia WHERE wallet_id = $1', [nueva])).rows[0].n).toBe(0);
  });

  it('la reversión quita la tabla y se puede volver a aplicar', async () => {
    await pool.query(down);
    expect(await tabla()).toBeNull();
    await pool.query(up);
    expect(await tabla()).toBe('wallet_custodia');
  });
});
