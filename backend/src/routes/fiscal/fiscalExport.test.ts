import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { Pool } from 'pg';
import { createTestDatabase, TestDatabase } from '../../test/setup-test-db';

// Los formatos excel y pdf de /:year/export no tenían NINGÚN test propio
// (csv y rentaweb sí, en fiscalCsvInjection.test.ts) — smoke test de
// status/content-type/tamaño no vacío, sin parsear el binario.
let testDb: TestDatabase;
let pool: Pool;
let app: import('express').Express;
let walletId: string;

describe('GET /api/fiscal/:year/export — excel y pdf', () => {
  beforeAll(async () => {
    testDb = await createTestDatabase();
    process.env.DATABASE_URL = testDb.connectionString;
    pool = new Pool({ connectionString: testDb.connectionString });

    const wallet = await pool.query(`INSERT INTO wallets (name, type) VALUES ('Wallet export test', 'hardware') RETURNING id`);
    walletId = wallet.rows[0].id;

    const buyTx = await pool.query(
      `INSERT INTO transactions (operation_type, timestamp, asset, amount, amount_net, wallet_id)
       VALUES ('BUY', '2023-01-01T00:00:00Z', 'BTC', 1, 1, $1) RETURNING id`,
      [walletId]
    );
    const lot = await pool.query(
      `INSERT INTO fifo_lots (asset, quantity_original, quantity_remaining, cost_basis_eur, price_per_unit_eur, open_transaction_id, opened_at, wallet_id, is_closed)
       VALUES ('BTC', 1, 1, 0, 0, $1, '2023-01-01T00:00:00Z', $2, FALSE) RETURNING id`,
      [buyTx.rows[0].id, walletId]
    );
    const sellTx = await pool.query(
      `INSERT INTO transactions (operation_type, timestamp, asset, amount, amount_net, wallet_id)
       VALUES ('SELL', '2023-06-01T00:00:00Z', 'BTC', 1, 1, $1) RETURNING id`,
      [walletId]
    );
    await pool.query(
      `INSERT INTO fifo_lot_consumptions (lot_id, consuming_transaction_id, quantity_consumed, cost_basis_consumed_eur, proceeds_eur, gain_loss_eur, fiscal_event_type, consumed_at)
       VALUES ($1, $2, 1, 0, 50, 50, 'GAIN', '2023-06-01T00:00:00Z')`,
      [lot.rows[0].id, sellTx.rows[0].id]
    );
    await pool.query(`UPDATE fifo_lots SET quantity_remaining = 0, is_closed = TRUE WHERE id = $1`, [lot.rows[0].id]);

    app = (await import('../../app')).default;
  });

  afterAll(async () => {
    await pool.end();
    if (testDb) await testDb.teardown();
  });

  it('format=excel devuelve un .xlsx no vacío con el content-type correcto', async () => {
    // exceljs escribe al stream de respuesta sin Content-Length (chunked) —
    // se bufferiza el binario igual que en el test de pdf.
    const res = await request(app).get('/api/fiscal/2023/export?format=excel').buffer().parse((response, callback) => {
      const chunks: Buffer[] = [];
      response.on('data', (chunk: Buffer) => chunks.push(chunk));
      response.on('end', () => callback(null, Buffer.concat(chunks)));
    });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('spreadsheetml');
    expect(res.headers['content-disposition']).toContain('fiscal_2023.xlsx');
    expect((res.body as Buffer).length).toBeGreaterThan(0);
  });

  it('format=pdf devuelve un PDF no vacío con el content-type correcto', async () => {
    const res = await request(app).get('/api/fiscal/2023/export?format=pdf').buffer().parse((response, callback) => {
      const chunks: Buffer[] = [];
      response.on('data', (chunk: Buffer) => chunks.push(chunk));
      response.on('end', () => callback(null, Buffer.concat(chunks)));
    });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/pdf');
    expect(res.headers['content-disposition']).toContain('fiscal_2023.pdf');
    expect((res.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('format desconocido devuelve 400', async () => {
    const res = await request(app).get('/api/fiscal/2023/export?format=xml');
    expect(res.status).toBe(400);
  });
});
