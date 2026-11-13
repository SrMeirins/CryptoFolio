import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { Pool } from 'pg';
import { createTestDatabase, TestDatabase } from '../../test/setup-test-db';

// Rentas en especie por base del IRPF (#537): el staking va a la base del
// ahorro y entra en la compensación; el airdrop va a la base general y solo
// se informa. Datos sintéticos.
let testDb: TestDatabase;
let pool: Pool;
let app: import('express').Express;

describe('Rentas en especie: base del ahorro y base general (#537)', () => {
  beforeAll(async () => {
    testDb = await createTestDatabase();
    process.env.DATABASE_URL = testDb.connectionString;
    pool = new Pool({ connectionString: testDb.connectionString });
    const w = await pool.query(`INSERT INTO wallets (name, type) VALUES ('Wallet base general', 'exchange') RETURNING id`);
    const walletId = w.rows[0].id;
    // 2025: 40 € de staking (ahorro) y 100 € de airdrop (general).
    for (const [op, asset, qty, price] of [['STAKING_REWARD', 'AAA', 4, 10], ['AIRDROP', 'BBB', 50, 2]] as const) {
      await pool.query(
        `INSERT INTO transactions (operation_type, timestamp, asset, amount, amount_net, wallet_id, price_per_unit)
         VALUES ($1, '2025-05-01T10:00:00Z', $2, $3, $3, $4, $5)`, [op, asset, qty, walletId, price]);
    }
    app = (await import('../../app')).default;
  });

  afterAll(async () => {
    await pool.end();
    if (testDb) await testDb.teardown();
  });

  it('el resumen del año separa los rendimientos del ahorro de la base general', async () => {
    const res = await request(app).get('/api/fiscal/2025/summary');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ totalRendimientos: 40, numRendimientos: 1, totalBaseGeneral: 100, numBaseGeneral: 1 });
  });

  it('la compensación y la comparativa solo cuentan los rendimientos del ahorro', async () => {
    const cf = await request(app).get('/api/fiscal/carryforward');
    expect(cf.body.detalle.find((d: { year: number }) => d.year === 2025)).toMatchObject({ rendimientos: 40 });
    const ov = await request(app).get('/api/fiscal/overview');
    expect(ov.body.find((o: { year: number }) => o.year === 2025)).toMatchObject({ totalRendimientos: 40 });
  });

  it('los eventos llevan su base y el CSV la dice en su columna (#547: una sola tabla)', async () => {
    const ev = await request(app).get('/api/fiscal/2025/events');
    expect(ev.body.rendimientos.map((r: { tipo: string; base: string }) => `${r.tipo}:${r.base}`).sort()).toEqual(['Airdrop:general', 'Staking:ahorro']);
    const lineas = (await request(app).get('/api/fiscal/2025/export?format=csv')).text.split('\r\n');
    expect(lineas.find(l => l.includes(';Staking;'))).toMatch(/;Staking;Ahorro;/);
    expect(lineas.find(l => l.includes(';Airdrop;'))).toMatch(/;Airdrop;General;/);
  });
});
