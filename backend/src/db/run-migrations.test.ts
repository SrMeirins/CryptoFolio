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
  it('no reaplica schema.sql (que no es idempotente) y registra el schema base sin error', async () => {
    await expect(runMigrations()).resolves.not.toThrow();

    const { rows } = await pool.query('SELECT version FROM schema_migrations ORDER BY version');
    const versions = rows.map((r: { version: string }) => r.version);

    // El historial pre-lanzamiento (002-024) se squasheó en schema.sql — ver
    // db/migrations/README.md. Las migraciones posteriores son idempotentes:
    // sobre un esquema recién aplicado (caso Docker, que ya incluye sus
    // tablas) se aplican sin error y quedan registradas.
    expect(versions).toEqual(['000_schema_base', '001_price_close_madrid']);
  });

  it('correr runMigrations() una segunda vez es un no-op seguro (idempotencia real)', async () => {
    const before = await pool.query('SELECT COUNT(*) FROM schema_migrations');

    await expect(runMigrations()).resolves.not.toThrow();

    const after = await pool.query('SELECT COUNT(*) FROM schema_migrations');
    expect(after.rows[0].count).toBe(before.rows[0].count);
  });
});
