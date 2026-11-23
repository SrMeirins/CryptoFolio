import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import type { Pool } from 'pg';
import { createTestDatabase, TestDatabase } from '../test/setup-test-db';

// API de alertas (#519): validación con esquema (precio positivo, activo
// existente), una sola de cartera, pausar, borrar y su aviso en la campana.
// Datos sintéticos.
let testDb: TestDatabase;
let pool: Pool;
let app: import('express').Express;

describe('/api/v1/alertas (#519)', () => {
  beforeAll(async () => {
    testDb = await createTestDatabase();
    process.env.DATABASE_URL = testDb.connectionString;
    pool = (await import('../db/client')).pool;
    await pool.query(`INSERT INTO asset_metadata (symbol, name, price_source) VALUES ('ZZTEST', 'Sintético', 'unknown') ON CONFLICT DO NOTHING`);
    const { default: router } = await import('./alertas');
    app = express();
    app.use(express.json());
    app.use('/api/v1/alertas', router);
  });
  afterAll(async () => { if (testDb) await testDb.teardown(); });

  const crear = (body: unknown) => request(app).post('/api/v1/alertas').send(body as object);

  it('valida con esquema: precio positivo, sentido, tipo y campos desconocidos', async () => {
    expect((await crear({ tipo: 'precio', activo: 'ZZTEST', sentido: 'por_encima', precio: -1 })).status).toBe(400);
    expect((await crear({ tipo: 'precio', activo: 'ZZTEST', sentido: 'arriba', precio: 1 })).status).toBe(400);
    expect((await crear({ tipo: 'otra' })).status).toBe(400);
    expect((await crear({ tipo: 'precio', activo: 'ZZTEST', sentido: 'por_encima', precio: 1, extra: true })).status).toBe(400);
    expect((await crear({ tipo: 'cartera', umbral_pct: 0 })).status).toBe(400);
  });

  it('el activo debe existir', async () => {
    const res = await crear({ tipo: 'precio', activo: 'NOEXISTE', sentido: 'por_encima', precio: 1 });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('no existe');
  });

  it('crea, lista, pausa y borra una alerta de precio', async () => {
    const res = await crear({ tipo: 'precio', activo: 'zztest', sentido: 'por_debajo', precio: 0.5, moneda: 'USD', repeticion: 'cada_vez' });
    expect(res.status).toBe(201);
    expect(res.body.alerta).toMatchObject({ activo: 'ZZTEST', sentido: 'por_debajo', precio: 0.5, moneda: 'USD', repeticion: 'cada_vez', activa: true });
    const id = res.body.alerta.id;
    expect((await request(app).get('/api/v1/alertas')).body.alertas).toHaveLength(1);
    const pausa = await request(app).put(`/api/v1/alertas/${id}`).send({ activa: false });
    expect(pausa.body.alerta.activa).toBe(false);
    expect((await request(app).put(`/api/v1/alertas/${id}`).send({})).status).toBe(400);
    expect((await request(app).put(`/api/v1/alertas/no-es-uuid`).send({ activa: true })).status).toBe(400);
    expect((await request(app).delete(`/api/v1/alertas/${id}`)).status).toBe(204);
    expect((await request(app).delete(`/api/v1/alertas/${id}`)).status).toBe(404);
  });

  it('una sola alerta de cartera', async () => {
    expect((await crear({ tipo: 'cartera', umbral_pct: 5 })).status).toBe(201);
    expect((await crear({ tipo: 'cartera', umbral_pct: 8 })).status).toBe(409);
  });

  it('una alerta disparada aparece en la campana en la categoría Alertas', async () => {
    await pool.query(`INSERT INTO alertas (tipo, activo, sentido, precio, activa, armada, ultimo_disparo_at, ultimo_valor)
      VALUES ('precio', 'ZZTEST', 'por_encima', 2, FALSE, FALSE, '2026-11-20T12:05:00Z', 2.1)`);
    const { collectNotifications } = await import('../modules/notifications/collect');
    const avisos = (await collectNotifications()).filter(n => n.category === 'Alertas');
    expect(avisos).toEqual([expect.objectContaining({ message: expect.stringContaining('ZZTEST ha subido por encima de 2,00 €') })]);
  });
});
