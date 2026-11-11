import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { Pool } from 'pg';
import { createTestDatabase, TestDatabase } from '../test/setup-test-db';

// Migración 023 (#599): caché de precios del momento y valoración de cada consumo.
const up = readFileSync(path.join(__dirname, 'migrations/023_precio_momento.sql'), 'utf8');
const down = readFileSync(path.join(__dirname, 'migrations/down/023_precio_momento.sql'), 'utf8');

let testDb: TestDatabase;
let pool: Pool;

const columnas = async () => (await pool.query(
  `SELECT column_name FROM information_schema.columns
   WHERE table_name = 'fifo_lot_consumptions' AND column_name IN ('valoracion', 'valor_entregado_eur', 'valor_recibido_eur')
   ORDER BY column_name`)).rows.map((r: { column_name: string }) => r.column_name);
const tabla = async () => (await pool.query(`SELECT to_regclass('price_momento') AS t`)).rows[0].t;

describe('migración 023_precio_momento', () => {
  beforeAll(async () => {
    testDb = await createTestDatabase();
    pool = new Pool({ connectionString: testDb.connectionString });
  }, 30000);

  afterAll(async () => {
    await pool.end();
    if (testDb) await testDb.teardown();
  });

  it('es idempotente sobre un esquema que ya la incluye', async () => {
    await pool.query(up);
    await pool.query(up);
    expect(await columnas()).toEqual(['valor_entregado_eur', 'valor_recibido_eur', 'valoracion']);
    expect(await tabla()).toBe('price_momento');
  });

  it('la caché rechaza precios no positivos y fuentes desconocidas', async () => {
    await expect(pool.query(`INSERT INTO price_momento (asset, momento, price_eur, fuente) VALUES ('BTC', NOW(), 0, '1m')`)).rejects.toThrow();
    await expect(pool.query(`INSERT INTO price_momento (asset, momento, price_eur, fuente) VALUES ('BTC', NOW(), 1, '5m')`)).rejects.toThrow();
  });

  it('la reversión quita la tabla y las columnas, y se puede volver a aplicar', async () => {
    await pool.query(down);
    expect(await columnas()).toEqual([]);
    expect(await tabla()).toBeNull();
    await pool.query(up);
    expect(await columnas()).toHaveLength(3);
  });
});
