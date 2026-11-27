import { describe, expect, it, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { Pool } from 'pg';
import { randomBytes } from 'crypto';
import { createTestDatabase, TestDatabase } from '../../test/setup-test-db';

// Ajustes, Conexiones (versión 1.0) contra una base aislada. La comprobación
// contra cada servicio se simula: ninguna llamada sale a la red. Claves
// sintéticas.
const { comprobarMock } = vi.hoisted(() => ({ comprobarMock: vi.fn() }));
vi.mock('../../modules/conexiones/comprobar', () => ({ comprobarClave: comprobarMock }));

const CLAVE = 'claveSinteticaDePrueba123';
let testDb: TestDatabase;
let pool: Pool;
let app: import('express').Express;
let coingecko: typeof import('../../modules/prices/coingeckoClient');

const estado = async (id: string) =>
  (await request(app).get('/api/settings/conexiones')).body.servicios.find((s: { id: string }) => s.id === id);

describe('routes/settings — conexiones (versión 1.0)', () => {
  beforeAll(async () => {
    testDb = await createTestDatabase();
    process.env.DATABASE_URL = testDb.connectionString;
    process.env.WALLET_SYNC_ENCRYPTION_KEY = randomBytes(32).toString('base64');
    // Entorno limpio: el de desarrollo puede traer claves reales.
    for (const v of ['ETHERSCAN_API_KEY', 'BLOCKFROST_API_KEY', 'SUBSCAN_API_KEY', 'COINGECKO_API_KEY', 'COINGECKO_BASE_URL']) delete process.env[v];
    pool = new Pool({ connectionString: testDb.connectionString });
    coingecko = await import('../../modules/prices/coingeckoClient');
    app = express();
    app.use(express.json());
    app.use('/api/settings', (await import('./settingsConexiones')).default);
  });

  beforeEach(async () => {
    comprobarMock.mockReset().mockResolvedValue('aceptada');
    await pool.query('DELETE FROM network_api_keys');
    await pool.query('DELETE FROM claves_servicio');
    delete process.env.BLOCKFROST_API_KEY;
    coingecko.configurarCoinGecko(null);
  });

  afterAll(async () => {
    await pool.end();
    await testDb.teardown();
  });

  it('lista los cuatro servicios sin configurar y con clave maestra', async () => {
    const res = await request(app).get('/api/settings/conexiones');
    expect(res.status).toBe(200);
    expect(res.body.claveMaestra).toBe(true);
    expect(res.body.servicios.map((s: { id: string; estado: string }) => `${s.id}:${s.estado}`))
      .toEqual(['etherscan:sin_configurar', 'blockfrost:sin_configurar', 'subscan:sin_configurar', 'coingecko:sin_configurar']);
  });

  it('marca como «entorno» la clave que solo viene del .env', async () => {
    process.env.BLOCKFROST_API_KEY = CLAVE;
    expect((await estado('blockfrost')).estado).toBe('entorno');
  });

  it('guarda una clave aceptada, cifrada, y nunca la devuelve', async () => {
    const res = await request(app).put('/api/settings/conexiones/etherscan').send({ api_key: CLAVE });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ guardada: true, comprobacion: 'aceptada' });
    const s = await estado('etherscan');
    expect(s.estado).toBe('configurada');
    expect(s.actualizada).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    const listado = JSON.stringify((await request(app).get('/api/settings/conexiones')).body);
    expect(listado).not.toContain(CLAVE);
    const { rows } = await pool.query('SELECT api_key_encrypted FROM network_api_keys');
    expect(rows[0].api_key_encrypted.toString('utf8')).not.toContain(CLAVE);
  });

  it('no guarda una clave que el servicio rechaza (422)', async () => {
    comprobarMock.mockResolvedValue('rechazada');
    const res = await request(app).put('/api/settings/conexiones/blockfrost').send({ api_key: CLAVE });
    expect(res.status).toBe(422);
    expect((await estado('blockfrost')).estado).toBe('sin_configurar');
  });

  it('guarda con aviso si el servicio no responde', async () => {
    comprobarMock.mockResolvedValue('sin_respuesta');
    const res = await request(app).put('/api/settings/conexiones/subscan').send({ api_key: CLAVE });
    expect(res.body).toEqual({ guardada: true, comprobacion: 'sin_respuesta' });
    expect((await estado('subscan')).estado).toBe('configurada');
  });

  it('la clave de CoinGecko con plan Pro cambia el servidor al momento, y quitarla lo devuelve', async () => {
    await request(app).put('/api/settings/conexiones/coingecko').send({ api_key: CLAVE, plan: 'pro' }).expect(200);
    expect((await estado('coingecko')).plan).toBe('pro');
    expect(coingecko.coinGeckoBaseUrl()).toBe('https://pro-api.coingecko.com/api/v3');
    await request(app).delete('/api/settings/conexiones/coingecko').expect(200);
    expect((await estado('coingecko')).estado).toBe('sin_configurar');
    expect(coingecko.coinGeckoBaseUrl()).toBe('https://api.coingecko.com/api/v3');
  });

  it('una clave cifrada con otra clave maestra queda «ilegible» y probarla lo dice', async () => {
    await request(app).put('/api/settings/conexiones/etherscan').send({ api_key: CLAVE }).expect(200);
    const original = process.env.WALLET_SYNC_ENCRYPTION_KEY;
    process.env.WALLET_SYNC_ENCRYPTION_KEY = randomBytes(32).toString('base64');
    try {
      expect((await estado('etherscan')).estado).toBe('ilegible');
      expect((await request(app).post('/api/settings/conexiones/etherscan/probar')).body).toEqual({ comprobacion: 'ilegible' });
    } finally {
      process.env.WALLET_SYNC_ENCRYPTION_KEY = original;
    }
  });

  it('probar sin clave devuelve null y con clave, la comprobación', async () => {
    expect((await request(app).post('/api/settings/conexiones/blockfrost/probar')).body).toEqual({ comprobacion: null });
    await request(app).put('/api/settings/conexiones/blockfrost').send({ api_key: CLAVE }).expect(200);
    comprobarMock.mockResolvedValue('rechazada');
    expect((await request(app).post('/api/settings/conexiones/blockfrost/probar')).body).toEqual({ comprobacion: 'rechazada' });
  });

  it('sin clave maestra no guarda (409) y lo indica en el estado', async () => {
    const original = process.env.WALLET_SYNC_ENCRYPTION_KEY;
    delete process.env.WALLET_SYNC_ENCRYPTION_KEY;
    try {
      expect((await request(app).get('/api/settings/conexiones')).body.claveMaestra).toBe(false);
      expect((await request(app).put('/api/settings/conexiones/etherscan').send({ api_key: CLAVE })).status).toBe(409);
      expect(comprobarMock).not.toHaveBeenCalled();
    } finally {
      process.env.WALLET_SYNC_ENCRYPTION_KEY = original;
    }
  });

  it('valida el servicio, la clave y el plan (400)', async () => {
    expect((await request(app).put('/api/settings/conexiones/kraken').send({ api_key: CLAVE })).status).toBe(400);
    expect((await request(app).put('/api/settings/conexiones/etherscan').send({ api_key: 'corta' })).status).toBe(400);
    expect((await request(app).put('/api/settings/conexiones/etherscan').send({ api_key: '<script>alert(1)</script>' })).status).toBe(400);
    expect((await request(app).put('/api/settings/conexiones/etherscan').send({ api_key: 'clave con espacios' })).status).toBe(400);
    expect((await request(app).put('/api/settings/conexiones/coingecko').send({ api_key: CLAVE, plan: 'gratis' })).status).toBe(400);
    expect(comprobarMock).not.toHaveBeenCalled();
  });
});
