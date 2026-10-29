import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import { createTestDatabase, TestDatabase } from '../../test/setup-test-db';

// API de vistas guardadas del Historial (#369) y endurecimiento del PUT
// genérico de configuración. Datos sintéticos.
let testDb: TestDatabase;
let app: import('express').Express;
let pool: import('pg').Pool;
const base = '/api/v1/historial/vistas';

describe('vistas guardadas del Historial', () => {
  beforeAll(async () => {
    testDb = await createTestDatabase();
    process.env.DATABASE_URL = testDb.connectionString;
    pool = (await import('../../db/client')).pool;
    const { default: vistas } = await import('./vistas');
    const { default: settings } = await import('../settings/settingsConfig');
    app = express();
    app.use(express.json());
    app.use(base, vistas);
    app.use('/api/settings', settings);
  });
  afterAll(async () => { if (testDb) await testDb.teardown(); });

  const crear = (body: object) => request(app).post(base).send(body);

  it('crea, lista, renombra y borra una vista', async () => {
    const c = await crear({ nombre: 'Ventas 2025', filtros: { type: 'SELL,SELL_FIAT', date_from: '2025-01-01', date_to: '2025-12-31', sort: 'valor', dir: 'desc' } });
    expect(c.status).toBe(201);
    const id = c.body.vista.id;
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect((await request(app).get(base)).body.vistas.map((v: { nombre: string }) => v.nombre)).toEqual(['Ventas 2025']);
    const r = await request(app).put(`${base}/${id}`).send({ nombre: 'Ventas del 2025' });
    expect(r.body.vista.nombre).toBe('Ventas del 2025');
    expect((await request(app).delete(`${base}/${id}`)).status).toBe(204);
    expect((await request(app).get(base)).body.vistas).toEqual([]);
  });

  it('nombre repetido (sin distinguir mayúsculas): 409 con el id, o sustitución si se pide', async () => {
    const a = await crear({ nombre: 'Retiradas', filtros: { type: 'WITHDRAW' } });
    const dup = await crear({ nombre: 'retiradas', filtros: { type: 'WITHDRAW_FIAT' } });
    expect(dup.status).toBe(409);
    expect(dup.body.id).toBe(a.body.vista.id);
    const sust = await crear({ nombre: 'retiradas', filtros: { type: 'WITHDRAW_FIAT' }, sustituir: true });
    expect(sust.status).toBe(200);
    expect(sust.body).toMatchObject({ sustituida: true, vista: { id: a.body.vista.id, filtros: { type: 'WITHDRAW_FIAT' } } });
    await request(app).delete(`${base}/${a.body.vista.id}`);
  });

  it('como mucho una predeterminada', async () => {
    const a = (await crear({ nombre: 'A', predeterminada: true, filtros: {} })).body.vista;
    const b = (await crear({ nombre: 'B', predeterminada: true, filtros: {} })).body.vista;
    const lista = (await request(app).get(base)).body.vistas as { id: string; predeterminada: boolean }[];
    expect(lista.filter(v => v.predeterminada).map(v => v.id)).toEqual([b.id]);
    await request(app).put(`${base}/${b.id}`).send({ predeterminada: false });
    expect(((await request(app).get(base)).body.vistas as { predeterminada: boolean }[]).some(v => v.predeterminada)).toBe(false);
    for (const v of [a, b]) await request(app).delete(`${base}/${v.id}`);
  });

  it('filtros validados con el esquema del Historial; sin moneda ni paginación', async () => {
    expect((await crear({ nombre: 'X', filtros: { type: "BUY' OR 1=1" } })).status).toBe(400);
    expect((await crear({ nombre: 'X', filtros: { value_min: '-1' } })).status).toBe(400);
    expect((await crear({ nombre: 'X', filtros: { currency: 'USD' } })).status).toBe(400);
    // El margen del resumen (#403) se guarda con la vista; solo true o false.
    const conMargen = await crear({ nombre: 'Con margen', filtros: { type: 'SELL', incluir_margen: 'true' } });
    expect(conMargen.status).toBe(201);
    expect(conMargen.body.vista.filtros.incluir_margen).toBe('true');
    await request(app).delete(`${base}/${conMargen.body.vista.id}`);
    expect((await crear({ nombre: 'X', filtros: { incluir_margen: 'si' } })).status).toBe(400);
    expect((await crear({ nombre: 'X', filtros: { limit: '10' } })).status).toBe(400);
    expect((await crear({ nombre: 'X', filtros: { foo: '1' } })).status).toBe(400);
  });

  it('nombre de 1–40 caracteres, sin control; campos desconocidos rechazados', async () => {
    expect((await crear({ nombre: '   ', filtros: {} })).status).toBe(400);
    expect((await crear({ nombre: 'x'.repeat(41), filtros: {} })).status).toBe(400);
    expect((await crear({ nombre: 'a\u0000b', filtros: {} })).status).toBe(400);
    expect((await crear({ nombre: 'ok', filtros: {}, admin: true })).status).toBe(400);
  });

  it('límite de 20 vistas', async () => {
    const ids: string[] = [];
    for (let i = 0; i < 20; i++) ids.push((await crear({ nombre: `Vista ${i}`, filtros: {} })).body.vista.id);
    const extra = await crear({ nombre: 'Vista 21', filtros: {} });
    expect(extra.status).toBe(400);
    for (const id of ids) await request(app).delete(`${base}/${id}`);
  });

  it('id inexistente → 404; id que no es UUID → 400', async () => {
    expect((await request(app).put(`${base}/7f3a1c2e-1b2c-4d5e-8f90-123456789abc`).send({ nombre: 'z' })).status).toBe(404);
    expect((await request(app).delete(`${base}/no-es-uuid`)).status).toBe(400);
  });

  it('un nombre con HTML se guarda tal cual (el frontend lo pinta como texto)', async () => {
    const v = (await crear({ nombre: '<img src=x onerror=1>', filtros: {} })).body.vista;
    expect((await request(app).get(base)).body.vistas[0].nombre).toBe('<img src=x onerror=1>');
    await request(app).delete(`${base}/${v.id}`);
  });

  it('un JSON dañado en app_config se trata como lista vacía', async () => {
    await pool.query(`INSERT INTO app_config (key, value) VALUES ('historial_vistas', '{no es json') ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`);
    const r = await request(app).get(base);
    expect(r.status).toBe(200);
    expect(r.body.vistas).toEqual([]);
    expect((await crear({ nombre: 'Nueva', filtros: {} })).status).toBe(201);
  });

  it('el PUT genérico de config no escribe historial_vistas y limita el valor a 2.000 caracteres', async () => {
    expect((await request(app).put('/api/settings/config').send({ key: 'historial_vistas', value: '[]' })).status).toBe(400);
    expect((await request(app).put('/api/settings/config').send({ key: 'algo', value: 'x'.repeat(2001) })).status).toBe(400);
    expect((await request(app).put('/api/settings/config').send({ key: 'algo', value: 'x'.repeat(2000) })).status).toBe(200);
  });
});
