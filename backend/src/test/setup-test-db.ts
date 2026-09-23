import { Pool } from 'pg';
import { randomBytes } from 'crypto';
import { readFileSync } from 'fs';
import path from 'path';

// Crea una base de datos Postgres nueva y aislada (no un simple schema) para
// que los tests de integración nunca puedan tocar los datos reales del usuario,
// incluso si algo en el aislamiento fallara. Se destruye al terminar (teardown).
export interface TestDatabase {
  connectionString: string;
  dbName: string;
  teardown: () => Promise<void>;
}

function maintenanceUrl(): URL {
  const base = process.env.DATABASE_URL;
  if (!base) {
    throw new Error('DATABASE_URL no está definida — los tests necesitan una conexión a Postgres (usa la del entorno Docker)');
  }
  const url = new URL(base);
  url.pathname = '/postgres'; // DB de mantenimiento, siempre existe, permite CREATE/DROP DATABASE
  return url;
}

export async function createTestDatabase(): Promise<TestDatabase> {
  const dbName = `cryptotracker_test_${randomBytes(4).toString('hex')}`;
  const admin = new Pool({ connectionString: maintenanceUrl().toString() });
  try {
    await admin.query(`CREATE DATABASE "${dbName}"`);
  } finally {
    await admin.end();
  }

  const testUrl = new URL(process.env.DATABASE_URL!);
  testUrl.pathname = `/${dbName}`;
  const connectionString = testUrl.toString();

  const schemaSql = readFileSync(path.join(__dirname, '../db/schema.sql'), 'utf-8');
  const setupPool = new Pool({ connectionString });
  try {
    await setupPool.query(schemaSql);
  } finally {
    await setupPool.end();
  }

  return {
    connectionString,
    dbName,
    teardown: async () => {
      const admin2 = new Pool({ connectionString: maintenanceUrl().toString() });
      try {
        // WITH (FORCE) corta conexiones activas — necesario porque cerramos el pool
        // de test justo antes, pero por seguridad ante conexiones colgadas.
        await admin2.query(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`);
      } finally {
        await admin2.end();
      }
    },
  };
}
