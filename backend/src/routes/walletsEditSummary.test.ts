import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { Pool } from 'pg';
import { createTestDatabase, TestDatabase } from '../test/setup-test-db';

// Edición y resumen de wallets (#448). Datos sintéticos.
let testDb: TestDatabase;
let pool: Pool;
let app: import('express').Express;
let walletId: string;

describe('routes/wallets — edición y resumen (#448)', () => {
  beforeAll(async () => {
    testDb = await createTestDatabase();
    process.env.DATABASE_URL = testDb.connectionString;
    pool = new Pool({ connectionString: testDb.connectionString });
    walletId = (await pool.query(`INSERT INTO wallets (name, type, color, notes) VALUES ('Cartera sintética', 'hardware', '#6366f1', 'nota original') RETURNING id`)).rows[0].id;
    app = (await import('../app')).default;
  });

  afterAll(async () => {
    await pool.end();
    if (testDb) await testDb.teardown();
  });

  const wallet = async () => (await pool.query('SELECT name, type, color, notes FROM wallets WHERE id = $1', [walletId])).rows[0];

  it('editar nombre y color sin enviar notas las conserva', async () => {
    const res = await request(app).put(`/api/wallets/${walletId}`).send({ name: 'Renombrada', color: '#00c896' });
    expect(res.status).toBe(200);
    expect(await wallet()).toMatchObject({ name: 'Renombrada', color: '#00c896', notes: 'nota original', type: 'hardware' });
  });

  it('el tipo y las notas se pueden cambiar; notes: null las vacía', async () => {
    expect((await request(app).put(`/api/wallets/${walletId}`).send({ name: 'Renombrada', type: 'software', notes: 'nueva' })).status).toBe(200);
    expect(await wallet()).toMatchObject({ type: 'software', notes: 'nueva' });
    expect((await request(app).put(`/api/wallets/${walletId}`).send({ name: 'Renombrada', notes: null })).status).toBe(200);
    expect((await wallet()).notes).toBeNull();
  });

  it('rechaza tipos y colores no válidos con 400 sin tocar nada', async () => {
    for (const body of [{ name: 'X', type: 'cueva' }, { name: 'X', color: 'red' }, { name: 'X', color: '#12345' }, { name: '' }]) {
      expect((await request(app).put(`/api/wallets/${walletId}`).send(body)).status).toBe(400);
    }
    expect((await wallet()).name).toBe('Renombrada');
  });

  it('una wallet del sistema no cambia de tipo (403)', async () => {
    const sys = (await pool.query(`SELECT id FROM wallets WHERE is_system = TRUE LIMIT 1`)).rows[0];
    if (!sys) return;
    expect((await request(app).put(`/api/wallets/${sys.id}`).send({ name: 'Sistema', type: 'bank' })).status).toBe(403);
  });

  it('el resumen cuenta las operaciones como origen o destino y la última fecha', async () => {
    const otra = (await pool.query(`INSERT INTO wallets (name, type) VALUES ('Destino sintético', 'exchange') RETURNING id`)).rows[0].id;
    await pool.query(
      `INSERT INTO transactions (operation_type, timestamp, asset, amount, amount_net, wallet_id) VALUES
       ('BUY', '2025-01-01T10:00:00Z', 'SINT', 1, 1, $1),
       ('WITHDRAW', '2025-03-01T10:00:00Z', 'SINT', 1, 1, $1)`, [walletId]);
    await pool.query(
      `INSERT INTO transactions (operation_type, timestamp, asset, amount, amount_net, wallet_id, destination_wallet_id)
       VALUES ('TRANSFER_INTERNAL', '2025-02-01T10:00:00Z', 'SINT', 1, 1, $1, $2)`, [otra, walletId]);
    const res = await request(app).get('/api/wallets/summary');
    expect(res.status).toBe(200);
    const mine = (res.body as Array<{ wallet_id: string; operations: number; last_activity: string }>).find(r => r.wallet_id === walletId)!;
    expect(mine.operations).toBe(3);
    expect(new Date(mine.last_activity).toISOString()).toBe('2025-03-01T10:00:00.000Z');
    const empty = (res.body as Array<{ wallet_id: string; operations: number; last_activity: string | null }>).find(r => r.wallet_id === otra)!;
    expect(empty.operations).toBe(1);
  });
});
