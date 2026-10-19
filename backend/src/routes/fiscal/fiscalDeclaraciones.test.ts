import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { Pool } from 'pg';
import { createTestDatabase, TestDatabase } from '../../test/setup-test-db';
import { madridYearMonth } from '../../modules/fiscal/madridTime';

// Ejercicios declarados (#311). Datos sintéticos.
let testDb: TestDatabase;
let pool: Pool;
let app: import('express').Express;
const Y = madridYearMonth().year;
let walletId: string;

// El lote se abre el mismo año de la venta: así no hay cartera que valorar a
// 31 de diciembre de otros años y el test no depende de precios por red (en CI
// la API de precios no responde y la valoración agotaría el tiempo).
async function seedSale(year: number, gain: number) {
  const at = `${year}-06-15T10:00:00Z`;
  const tx = (await pool.query(`INSERT INTO transactions (operation_type, timestamp, asset, amount, amount_net, wallet_id) VALUES ('SELL', $1, 'BTC', 1, 1, $2) RETURNING id`, [at, walletId])).rows[0].id;
  const lot = (await pool.query(
    `INSERT INTO fifo_lots (asset, quantity_original, quantity_remaining, cost_basis_eur, price_per_unit_eur, open_transaction_id, opened_at, wallet_id, is_closed)
     VALUES ('BTC', 1, 0, 0, 0, $1, $3, $2, TRUE) RETURNING id`, [tx, walletId, `${year}-01-01T00:00:00Z`])).rows[0].id;
  await pool.query(
    `INSERT INTO fifo_lot_consumptions (lot_id, consuming_transaction_id, quantity_consumed, cost_basis_consumed_eur, proceeds_eur, gain_loss_eur, fiscal_event_type, consumed_at)
     VALUES ($1, $2, 1, 0, $3, $4, $5, $6)`, [lot, tx, Math.max(gain, 0), gain, gain >= 0 ? 'GAIN' : 'LOSS', at]);
}

describe('/api/fiscal — ejercicios declarados (#311)', () => {
  beforeAll(async () => {
    testDb = await createTestDatabase();
    process.env.DATABASE_URL = testDb.connectionString;
    pool = new Pool({ connectionString: testDb.connectionString });
    walletId = (await pool.query(`INSERT INTO wallets (name, type) VALUES ('W decl', 'hardware') RETURNING id`)).rows[0].id;
    await seedSale(Y - 1, 1_000);
    app = (await import('../../app')).default;
  });
  afterAll(async () => {
    await pool.end();
    if (testDb) await testDb.teardown();
  });

  it('marca la Renta con las cifras actuales y detecta un cambio posterior', async () => {
    const put = await request(app).put(`/api/fiscal/${Y - 1}/declaracion/renta`).send({});
    expect(put.status).toBe(200);
    expect(put.body.cifras).toMatchObject({ ganancias: 1000, neto: 1000, operaciones: 1, base: 1000, cuota: 190 });
    let lista = (await request(app).get('/api/fiscal/declaraciones')).body;
    expect(lista[0]).toMatchObject({ ejercicio: Y - 1, tipo: 'renta', cambios: [] });

    await seedSale(Y - 1, 500);   // una importación posterior cambia el ejercicio
    lista = (await request(app).get('/api/fiscal/declaraciones')).body;
    const campos = lista[0].cambios.map((c: { campo: string; declarado: number; actual: number }) => `${c.campo}:${c.declarado}→${c.actual}`);
    expect(campos).toEqual(['ganancias:1000→1500', 'neto:1000→1500', 'operaciones:1→2', 'base:1000→1500', 'cuota:190→285']);

    // Actualizar la marca la pone al día.
    await request(app).put(`/api/fiscal/${Y - 1}/declaracion/renta`).send({});
    expect((await request(app).get('/api/fiscal/declaraciones')).body[0].cambios).toEqual([]);
  });

  it('el 721 presentado guarda el valor y lo usa el ejercicio siguiente', async () => {
    const put = await request(app).put(`/api/fiscal/${Y - 2}/declaracion/modelo721`).send({ valor: 60_000 });
    expect(put.body.cifras).toMatchObject({ valor: 60_000, umbral: 50_000 });
    const m = (await request(app).get(`/api/fiscal/${Y - 1}/modelo721`)).body;
    expect(m.ultimaPresentacion).toEqual({ ejercicio: Y - 2, valor: 60_000 });
    expect(m.obligado).toBe(false);
    expect((await request(app).get(`/api/fiscal/${Y - 2}/modelo721`)).body.presentado).toMatchObject({ valor: 60_000 });
  });

  it('quita la marca y valida la entrada', async () => {
    expect((await request(app).delete(`/api/fiscal/${Y - 1}/declaracion/renta`)).status).toBe(200);
    expect((await request(app).delete(`/api/fiscal/${Y - 1}/declaracion/renta`)).status).toBe(404);
    expect((await request(app).put(`/api/fiscal/${Y}/declaracion/renta`).send({})).status).toBe(400);      // año en curso
    expect((await request(app).put(`/api/fiscal/${Y - 1}/declaracion/renta`).send({ neto: 1 })).status).toBe(400);
    expect((await request(app).put(`/api/fiscal/${Y - 1}/declaracion/modelo721`).send({ valor: -1 })).status).toBe(400);
    expect((await request(app).delete(`/api/fiscal/${Y - 1}/declaracion/otro`)).status).toBe(400);
  });
});
