import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import express from 'express';
import { Pool } from 'pg';
import { createTestDatabase, TestDatabase } from '../../test/setup-test-db';

// Escalas del ahorro por ejercicio (#452).
let testDb: TestDatabase;
let pool: Pool;
let app: express.Express;

describe('GET/PUT/DELETE /fiscal/escalas/:year (#452)', () => {
  beforeAll(async () => {
    testDb = await createTestDatabase();
    process.env.DATABASE_URL = testDb.connectionString;
    pool = new Pool({ connectionString: testDb.connectionString });
    const { default: router } = await import('./fiscalEscalas');
    app = express();
    app.use(express.json());
    app.use('/api/fiscal', router);
  });
  afterAll(async () => {
    await pool.end();
    if (testDb) await testDb.teardown();
  });

  it('cada ejercicio devuelve su escala oficial, con su número de tramos', async () => {
    const e2022 = (await request(app).get('/api/fiscal/escalas/2022')).body;
    expect(e2022).toMatchObject({ ejercicio: 2022, personalizada: false });
    expect(e2022.tramos.map((t: { tipo: number }) => t.tipo)).toEqual([19, 21, 23, 26]);
    expect(e2022.tramos.at(-1).hasta).toBeNull();
    const e2024 = (await request(app).get('/api/fiscal/escalas/2024')).body;
    expect(e2024.tramos.map((t: { tipo: number }) => t.tipo)).toEqual([19, 21, 23, 27, 28]);
  });

  it('cambiar los tipos de un año no toca los de otro; DELETE vuelve a la oficial', async () => {
    const put = await request(app).put('/api/fiscal/escalas/2024').send({ tipos: [20, 22, 24, 28, 29] });
    expect(put.status).toBe(200);
    expect(put.body.personalizada).toBe(true);
    expect(put.body.tramos[0]).toEqual({ hasta: 6000, tipo: 20, tipoOficial: 19 });
    expect((await request(app).get('/api/fiscal/escalas/2023')).body.personalizada).toBe(false);
    const del = await request(app).delete('/api/fiscal/escalas/2024');
    expect(del.body.personalizada).toBe(false);
    expect(del.body.tramos[0].tipo).toBe(19);
  });

  it('rechaza tipos que no encajan con la escala del año o fuera de rango', async () => {
    for (const tipos of [[19, 21, 23], [0, 21, 23, 26], [19, 21, 23, 101], ['19', 21, 23, 26]]) {
      expect((await request(app).put('/api/fiscal/escalas/2022').send({ tipos })).status).toBe(400);
    }
    for (const y of ['abc', '1999', '2101']) expect((await request(app).get(`/api/fiscal/escalas/${y}`)).status).toBe(400);
  });
});
