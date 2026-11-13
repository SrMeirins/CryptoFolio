import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { Pool } from 'pg';
import { createTestDatabase, TestDatabase } from '../test/setup-test-db';

// Modelo 721 por custodia (#545): regla automática de Binance por fechas,
// subcuentas que suman juntas, lo que indica el usuario por encima de la
// regla, la pregunta de una wallet creada a mano y las posiciones guardadas al
// presentarlo. Precio del día simulado (1.000 €/u); datos sintéticos.
vi.mock('../modules/prices/binance', () => ({ getHistoricalPriceEur: vi.fn(async () => 1000) }));

let testDb: TestDatabase;
let pool: Pool;
let app: import('express').Express;
let spot: string; let funding: string; let propia: string;

const m721 = async (y: number) => (await request(app).get(`/api/fiscal/${y}/modelo721`)).body;

describe('Modelo 721 por custodia (#545)', () => {
  beforeAll(async () => {
    testDb = await createTestDatabase();
    process.env.DATABASE_URL = testDb.connectionString;
    pool = new Pool({ connectionString: testDb.connectionString });
    const id = async (name: string) => (await pool.query('SELECT id FROM wallets WHERE name = $1', [name])).rows[0].id as string;
    [spot, funding] = [await id('Binance Spot'), await id('Binance Funding')];
    propia = (await pool.query(`INSERT INTO wallets (name, type) VALUES ('Exchange Sintético', 'exchange') RETURNING id`)).rows[0].id;
    const llavero = (await pool.query(`INSERT INTO wallets (name, type) VALUES ('Autocustodia Sintética', 'hardware') RETURNING id`)).rows[0].id;
    // 40 AAA en Spot y 20 en Funding (60.000 €) desde 2021; 5 AAA en la wallet propia y 3 en autocustodia.
    for (const [w, q] of [[spot, 40], [funding, 20], [propia, 5], [llavero, 3]] as const) {
      await pool.query(
        `INSERT INTO transactions (operation_type, timestamp, asset, amount, amount_net, cost_asset, cost_amount, wallet_id)
         VALUES ('BUY', '2021-06-01T10:00:00Z', 'AAA', $1, $1, 'EUR', $2, $3)`, [q, q * 500, w]);
    }
    app = (await import('../app')).default;
    const { runFifoEngine } = await import('../modules/fifo/engine');
    expect((await runFifoEngine()).errors).toEqual([]);
  }, 30000);

  afterAll(async () => {
    await pool.end();
    if (testDb) await testDb.teardown();
  });

  it('Binance, automático: en 2021 fuera de España (computa); desde julio de 2022, Binance Spain (no computa)', async () => {
    const r21 = await m721(2021);
    const b21 = r21.grupos.find((g: { clave: string }) => g.clave.startsWith('entidad:Binance'));
    expect(b21).toMatchObject({ computa: true, enEspana: false, totalEur: 60_000 });
    expect(b21.wallets.map((w: { origen: string }) => w.origen)).toEqual(['automatico', 'automatico']);
    // Las dos subcuentas suman en un grupo; la wallet propia, sin dato, computa por prudencia.
    expect(r21.veredicto).toMatchObject({ obligado: true, motivo: 'umbral', valorEur: 65_000 });
    expect(r21.sinCustodia).toEqual([{ id: propia, nombre: 'Exchange Sintético' }]);
    const r22 = await m721(2022);
    expect(r22.grupos.find((g: { clave: string }) => g.clave === 'entidad:Binance Spain, S.L.')).toMatchObject({ computa: false, enEspana: true });
    expect(r22.reglas.map((x: { clave: string }) => x.clave)).toEqual(['binance', 'bitvavo']);
    // El histórico separa lo que computa de lo que está en exchanges en España.
    const h22 = r22.historico.find((h: { ejercicio: number }) => h.ejercicio === 2022);
    expect(h22).toMatchObject({ valorEur: 5_000, noComputaEur: 60_000, autocustodiaEur: 3_000 });
  });

  it('la pregunta de tres botones: «en el extranjero» quita el aviso y sigue computando', async () => {
    expect((await request(app).put(`/api/fiscal/custodia/${propia}`).send({ enEspana: false })).status).toBe(200);
    const r = await m721(2022);
    expect(r.sinCustodia).toEqual([]);
    expect(r.grupos.find((g: { clave: string }) => g.clave === `wallet:${propia}`)).toMatchObject({ computa: true, enEspana: false });
  });

  it('valida: fecha real, país coherente y nada de campos de más', async () => {
    const put = (body: object) => request(app).put(`/api/fiscal/custodia/${spot}`).send(body);
    expect((await put({ enEspana: true, desde: '2023-02-30' })).status).toBe(400);
    expect((await put({ enEspana: true, entidad: { nombre: 'X', pais: 'MT' } })).status).toBe(400);
    expect((await put({ enEspana: true, extra: 1 })).status).toBe(400);
    expect((await request(app).put('/api/fiscal/custodia/no-uuid').send({ enEspana: true })).status).toBe(400);
  });

  it('lo que indica el usuario prevalece sobre la regla automática, y restablecer vuelve a ella', async () => {
    // Su cuenta pasó a Binance Spain más tarde: fuera de España hasta 2023.
    for (const w of [spot, funding]) {
      const r = await request(app).put(`/api/fiscal/custodia/${w}`)
        .send({ enEspana: false, entidad: { nombre: 'Binance Ejemplo Ltd', pais: 'MT' } });
      expect(r.status).toBe(200);
    }
    const r22 = await m721(2022);
    const g = r22.grupos.find((x: { clave: string }) => x.clave === 'entidad:Binance Ejemplo Ltd');
    expect(g).toMatchObject({ computa: true, totalEur: 60_000 });
    expect(g.wallets.map((w: { origen: string }) => w.origen)).toEqual(['usuario', 'usuario']);
    const lista = (await request(app).get('/api/fiscal/custodia')).body;
    expect(lista.wallets.find((w: { walletId: string }) => w.walletId === spot)).toMatchObject({ regla: 'binance', hoy: { origen: 'usuario' } });
    for (const w of [spot, funding]) expect((await request(app).delete(`/api/fiscal/custodia/${w}`)).body.quitadas).toBe(1);
    expect((await m721(2022)).grupos.some((x: { clave: string }) => x.clave === 'entidad:Binance Spain, S.L.')).toBe(true);
  });

  it('marcarlo presentado guarda las posiciones por entidad y moneda', async () => {
    expect((await request(app).put('/api/fiscal/2021/declaracion/modelo721').send({})).status).toBe(200);
    const d = (await pool.query(`SELECT cifras FROM fiscal_declaraciones WHERE ejercicio = 2021 AND tipo = 'modelo721'`)).rows[0].cifras;
    expect(d.valor).toBe(65_000);
    expect(d.posiciones).toEqual(expect.arrayContaining([
      expect.objectContaining({ entidad: 'Binance (sociedad del grupo fuera de España)', asset: 'AAA', unidades: 60 }),
    ]));
    // En 2022 Binance pasa a España: lo declarado allí se extingue y obliga.
    expect((await m721(2022)).veredicto).toMatchObject({ obligado: true, motivo: 'extincion' });
  });

  it('quitar una fila del usuario vuelve a «no se sabe» en una wallet sin regla', async () => {
    const lista = (await request(app).get('/api/fiscal/custodia')).body;
    const fila = lista.wallets.find((w: { walletId: string }) => w.walletId === propia).filas[0];
    expect((await request(app).delete(`/api/fiscal/custodia/filas/${fila.id}`)).status).toBe(200);
    expect((await m721(2022)).sinCustodia).toEqual([{ id: propia, nombre: 'Exchange Sintético' }]);
  });
});
