import { Pool, PoolClient, QueryResultRow } from 'pg';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL no está definida en las variables de entorno');
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,                  // Máximo de conexiones concurrentes
  idleTimeoutMillis: 30000, // Cerrar conexiones idle tras 30s
  connectionTimeoutMillis: 5000,
});

// Helper para queries simples
export const db = {
  // any como default replica la propia firma de pg (Pool.query<T = any>): los
  // ~40 call sites existentes dependen de inferencia contextual contra las
  // filas devueltas (sin pasar <T>) y romperían con un default más estricto
  // (QueryResultRow). Los call sites nuevos pueden tipar pasando <T> explícito.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query: <T extends QueryResultRow = any>(text: string, params?: unknown[]) =>
    pool.query<T>(text, params),

  // Para transacciones SQL (no confundir con crypto transactions)
  transaction: async <T>(fn: (client: PoolClient) => Promise<T>): Promise<T> => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },
};

// Obligatorio, no solo logging: si una conexión idle del pool lanza un error
// y nadie escucha este evento, node-postgres lo propaga como excepción no
// capturada y mata el proceso entero. Este listener evita ese crash.
pool.on('error', (err) => {
  console.error('[DB POOL ERROR]', err.stack ?? err.message);
});
