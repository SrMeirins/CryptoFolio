import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase, TestDatabase } from '../test/setup-test-db';

let testDb: TestDatabase;
let pool: typeof import('./client')['pool'];
let runMigrations: typeof import('./run-migrations')['runMigrations'];

beforeAll(async () => {
  // createTestDatabase() ya aplica schema.sql al crear la BD de test — esto
  // simula exactamente el escenario de Docker: el esquema existe desde
  // docker-entrypoint-initdb.d, pero runMigrations() nunca ha corrido ahí.
  testDb = await createTestDatabase();
  process.env.DATABASE_URL = testDb.connectionString;
  ({ pool } = await import('./client'));
  ({ runMigrations } = await import('./run-migrations'));
}, 30000);

afterAll(async () => {
  await pool.end();
  await testDb.teardown();
});

describe('runMigrations — arranque contra un esquema ya existente (simula Docker)', () => {
  it('no reaplica schema.sql (que no es idempotente) y registra todas las migraciones sin error', async () => {
    await expect(runMigrations()).resolves.not.toThrow();

    const { rows } = await pool.query('SELECT version FROM schema_migrations ORDER BY version');
    const versions = rows.map((r: { version: string }) => r.version);

    expect(versions).toContain('000_schema_base');
    expect(versions).toContain('002_operation_types');
    expect(versions).toContain('015_fifo_lots_clock_timestamp');
    // El propio schema.sql ya no lista 011/012 (reparación puntual / limpieza ya
    // horneada) — solo los ficheros que existen hoy en migrations/ deben registrarse.
    expect(versions.length).toBeGreaterThanOrEqual(14);
  });

  it('correr runMigrations() una segunda vez es un no-op seguro (idempotencia real)', async () => {
    const before = await pool.query('SELECT COUNT(*) FROM schema_migrations');

    await expect(runMigrations()).resolves.not.toThrow();

    const after = await pool.query('SELECT COUNT(*) FROM schema_migrations');
    expect(after.rows[0].count).toBe(before.rows[0].count);
  });
});
