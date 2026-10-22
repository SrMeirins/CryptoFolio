import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import type { Pool } from 'pg';
import { createTestDatabase, TestDatabase } from '../../test/setup-test-db';
import { HISTORY_CSV_HEADER } from '../../modules/history/csvFormat';

// GET /export.csv del Historial (#349): todo lo filtrado, en streaming por
// lotes, saneado y con el orden del listado. Datos sintéticos.
let testDb: TestDatabase;
let pool: Pool;
let app: import('express').Express;
const N = 1205; // más de un lote de 1.000

/** Supertest con el cuerpo como texto (text/csv no se parsea por defecto). */
const csv = (qs = '') => request(app).get(`/api/transactions/export.csv${qs}`).buffer(true).parse((res, cb) => {
  let data = '';
  res.setEncoding('utf8');
  res.on('data', (c: string) => { data += c; });
  res.on('end', () => cb(null, data));
});
const lines = (body: string) => body.replace(/^\uFEFF/, '').trimEnd().split('\n');

describe('routes/transactions — exportación CSV', () => {
  beforeAll(async () => {
    testDb = await createTestDatabase();
    process.env.DATABASE_URL = testDb.connectionString;
    // Pool de la app (con su manejador de errores): uno propio sin manejador
    // provocaba un error no capturado al cortar el teardown sus conexiones.
    pool = (await import('../../db/client')).pool;
    const w = (await pool.query(`INSERT INTO wallets (name, type) VALUES ('Exchange test', 'exchange') RETURNING id`)).rows[0].id;
    // N compras en EUR, una por hora, con importes crecientes.
    await pool.query(
      `INSERT INTO transactions (operation_type, timestamp, asset, amount, amount_net, cost_asset, cost_amount, wallet_id)
       SELECT 'BUY', TIMESTAMPTZ '2025-01-01T00:00:00Z' + (g || ' hours')::interval, 'BTC', 1, 1, 'EUR', g, $1
       FROM generate_series(1, ${N}) g`, [w]);
    await pool.query(
      `INSERT INTO transactions (operation_type, timestamp, asset, amount, amount_net, wallet_id, notes)
       VALUES ('TRANSFER_INTERNAL', '2024-06-01T10:00:00Z', 'XRP', 5, 5, $1, '=HYPERLINK("http://x");b')`, [w]);

    const { default: router } = await import('./index');
    app = express();
    app.use('/api/transactions', router);
  });

  afterAll(async () => {
    if (testDb) await testDb.teardown();
  });

  it('exporta todas las filas (varios lotes) con BOM, cabecera y cabeceras HTTP seguras', async () => {
    const res = await csv();
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('text/csv; charset=utf-8');
    expect(res.headers['content-disposition']).toMatch(/^attachment; filename="historial_\d{4}-\d{2}-\d{2}\.csv"$/);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body.startsWith('\uFEFF')).toBe(true);
    const ls = lines(res.body);
    expect(ls[0]).toBe(HISTORY_CSV_HEADER);
    expect(ls).toHaveLength(N + 2);
    expect(new Set(ls.slice(1).map(l => l.split(';')[20])).size).toBe(N + 1); // IDs únicos
  });

  it('respeta el orden del listado: por defecto fecha desc; por valor asc', async () => {
    const porFecha = lines((await csv()).body);
    expect(porFecha[1].startsWith('2025-02-20T')).toBe(true);           // la más reciente
    const porValor = lines((await csv('?sort=valor&dir=asc')).body);
    expect(porValor[1].split(';')[9]).toBe('1.00');
    expect(porValor[porValor.length - 1].split(';')[13]).toBe('sin_precio'); // sin precio al final
  });

  it('aplica los filtros y lo indica en el nombre del archivo, sin datos del filtro', async () => {
    const res = await csv('?asset=xrp');
    expect(lines(res.body)).toHaveLength(2);
    expect(res.headers['content-disposition']).toMatch(/filename="historial_\d{4}-\d{2}-\d{2}_filtrado\.csv"$/);
    expect(res.headers['content-disposition']).not.toContain('xrp');
  });

  it('respeta los filtros avanzados (#366): tipos y rango de importe', async () => {
    // Compras con importe g = 1…N: entre 100 y 199 € hay 100.
    expect(lines((await csv('?type=BUY,SELL&value_min=100&value_max=199.99')).body)).toHaveLength(101);
  });

  it('fechas ISO 8601 locales con desfase y punto decimal', async () => {
    const fila = lines((await csv('?asset=XRP')).body)[1].split(';');
    expect(fila[0]).toBe('2024-06-01T12:00:00+02:00');
    expect(fila[3]).toBe('5');
  });

  it('neutraliza fórmulas y cita el separador en las notas', async () => {
    const fila = lines((await csv('?asset=XRP')).body)[1];
    expect(fila).toContain(`"'=HYPERLINK(""http://x"");b"`);
  });

  it('valida los filtros y rechaza la paginación', async () => {
    expect((await csv('?limit=10')).status).toBe(400);
    expect((await csv('?sort=notes')).status).toBe(400);
    expect((await csv("?wallet_id=x' OR 1=1")).status).toBe(400);
  });
});
