import { Pool, PoolClient } from 'pg';

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
  query: (text: string, params?: unknown[]) => pool.query(text, params),

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

// Log de errores del pool
pool.on('error', (err) => {
  console.error('[DB POOL ERROR]', err.message);
});
