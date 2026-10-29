import { describe, expect, it, vi, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import { Pool } from 'pg';
import { randomUUID } from 'crypto';
import { createTestDatabase, TestDatabase } from '../../test/setup-test-db';

// Copias (#453) contra una base de pruebas aislada y con datos sintéticos.
// El motor FIFO se sustituye: aquí solo importa que se lance tras restaurar.
const { runFifoEngineMock } = vi.hoisted(() => ({ runFifoEngineMock: vi.fn(() => Promise.resolve({})) }));
vi.mock('../../modules/fifo/engine', () => ({ runFifoEngine: runFifoEngineMock }));

let testDb: TestDatabase;
let pool: Pool;
let app: import('express').Express;

async function count(table: string): Promise<number> {
  return Number((await pool.query(`SELECT COUNT(*) FROM ${table}`)).rows[0].count);
}

// Estado sintético: una wallet propia con dirección, una importación con su
// fila original, dos transacciones enlazadas (una en una wallet del sistema),
// un activo, un ajuste, una escala IRPF y una declaración.
async function seed(): Promise<{ propia: string; spot: string }> {
  const eth = (await pool.query(`SELECT id FROM networks WHERE name = 'Ethereum'`)).rows[0].id;
  const spot = (await pool.query(`SELECT id FROM wallets WHERE name = 'Binance Spot'`)).rows[0].id;
  const propia = (await pool.query(`INSERT INTO wallets (name, type, notes) VALUES ('Fría sintética', 'hardware', 'nota') RETURNING id`)).rows[0].id;
  await pool.query(`INSERT INTO wallet_addresses (wallet_id, network_id, address) VALUES ($1, $2, '0xSINTETICA')`, [propia, eth]);
  const imp = (await pool.query(`INSERT INTO csv_imports (filename, file_hash, row_count, exchange) VALUES ('sint.csv', 'fh-sint', 2, 'binance') RETURNING id`)).rows[0].id;
  const salida = (await pool.query(
    `INSERT INTO transactions (operation_type, timestamp, asset, amount, amount_net, wallet_id, destination_wallet_id, import_id, counterparty_network_id)
     VALUES ('WITHDRAW', '2024-03-01T10:00:00Z', 'SINT', 2, 2, $1, $2, $3, $4) RETURNING id`, [spot, propia, imp, eth])).rows[0].id;
  await pool.query(
    `INSERT INTO transactions (operation_type, timestamp, asset, amount, amount_net, wallet_id, linked_tx_id, import_id)
     VALUES ('DEPOSIT_CRYPTO', '2024-03-01T10:05:00Z', 'SINT', 2, 2, $1, $2, $3)`, [propia, salida, imp]);
  await pool.query(
    `INSERT INTO raw_transactions (import_id, user_id, time, account, operation, coin, change, remark, row_hash, transaction_id, original_row)
     VALUES ($1, '', '2024-03-01T10:00:00Z', 'Spot', 'Withdraw', 'SINT', -2, '', 'rh-sint', $2, '{"Operation":"Withdraw"}')`, [imp, salida]);
  await pool.query(`INSERT INTO asset_metadata (symbol, name, disabled_pairs) VALUES ('SINT', 'Sintética', ARRAY['SINTBTC']) ON CONFLICT DO NOTHING`);
  await pool.query(`INSERT INTO app_config (key, value) VALUES ('theme', 'dark') ON CONFLICT (key) DO UPDATE SET value = 'dark'`);
  await pool.query(`INSERT INTO irpf_escalas (ejercicio, tipos) VALUES (2024, ARRAY[19, 21, 23, 27, 28])`);
  await pool.query(`INSERT INTO fiscal_declaraciones (ejercicio, tipo, cifras) VALUES (2024, 'renta', '{"ganancia":1}')`);
  return { propia, spot };
}

describe('routes/settings — copias de seguridad (#453)', () => {
  beforeAll(async () => {
    testDb = await createTestDatabase();
    process.env.DATABASE_URL = testDb.connectionString;
    pool = new Pool({ connectionString: testDb.connectionString });
    const { default: router } = await import('./settingsBackup');
    app = express();
    app.use(express.json({ limit: '10mb' }));
    app.use('/api/settings', router);
    await seed();
  });

  afterAll(async () => {
    await pool.end();
    if (testDb) await testDb.teardown();
  });

  it('GET /backup: copia en claro con todas las tablas no recalculables', async () => {
    const res = await request(app).get('/api/settings/backup');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ format: 'cryptofolio-backup', encrypted: false });
    expect(Object.keys(res.body.data).sort()).toEqual([
      'app_config', 'asset_metadata', 'cobertura_revisiones', 'csv_imports', 'fiscal_declaraciones', 'irpf_escalas',
      'network_assets', 'networks', 'raw_transactions', 'transactions', 'wallet_addresses', 'wallets',
    ]);
    expect(res.body.counts).toMatchObject({ transactions: 2, raw_transactions: 1, wallet_addresses: 1, irpf_escalas: 1 });
    expect(JSON.stringify(res.body)).not.toMatch(/network_api_keys|price_cache|fifo_lots/);
  });

  it('POST /backup con contraseña corta: 400', async () => {
    const res = await request(app).post('/api/settings/backup').send({ password: 'corta' });
    expect(res.status).toBe(400);
  });

  it('restaurar sin confirmación o con un fichero manipulado no toca nada', async () => {
    const file = (await request(app).post('/api/settings/backup').send({ password: 'contrasena-larga' })).body;
    const antes = await count('transactions');
    const sinConfirmar = await request(app).post('/api/settings/backup/restore').send({ backup: file, password: 'contrasena-larga' });
    expect(sinConfirmar.status).toBe(400);
    const tag = Buffer.from(file.cipher.tag, 'base64'); tag[0] ^= 1;
    const manipulado = await request(app).post('/api/settings/backup/restore')
      .send({ backup: { ...file, cipher: { ...file.cipher, tag: tag.toString('base64') } }, password: 'contrasena-larga', confirm: true });
    expect(manipulado.status).toBe(400);
    expect(manipulado.body.code).toBe('contrasena');
    const nueva = await request(app).post('/api/settings/backup/restore').send({ backup: { ...file, schema: 999 }, password: 'contrasena-larga', confirm: true });
    expect(nueva.status).toBe(409);
    expect(await count('transactions')).toBe(antes);
    expect(await count('backup_snapshots')).toBe(0);
  });

  it('un valor que la base no acepta se rechaza y deja los datos como estaban', async () => {
    const file = (await request(app).get('/api/settings/backup')).body;
    file.data.transactions[0].operation_type = 'NO_EXISTE';
    const res = await request(app).post('/api/settings/backup/restore').send({ backup: file, confirm: true });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('datos');
    expect(await count('transactions')).toBe(2);
    expect(await count('backup_snapshots')).toBe(0);
  });

  it('una columna que la versión actual no conoce se rechaza', async () => {
    const file = (await request(app).get('/api/settings/backup')).body;
    file.data.wallets[0].columna_rara = 1;
    const res = await request(app).post('/api/settings/backup/restore').send({ backup: file, confirm: true });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/columna desconocida/);
  });

  it('vista previa: recuentos de la copia frente a los actuales, sin cambiar nada', async () => {
    const file = (await request(app).post('/api/settings/backup').send({ password: 'contrasena-larga' })).body;
    const sin = await request(app).post('/api/settings/backup/preview').send({ backup: file });
    expect(sin.status).toBe(400);
    expect(sin.body.code).toBe('contrasena');
    const res = await request(app).post('/api/settings/backup/preview').send({ backup: file, password: 'contrasena-larga' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ encrypted: true, counts: { transactions: 2 }, current: { transactions: 2 } });
  });

  it('restaurar en otro equipo: casa las wallets del sistema por nombre, guarda el estado previo y permite volver', async () => {
    const original = (await request(app).post('/api/settings/backup').send({ password: 'contrasena-larga' })).body;
    const enClaro = (await request(app).get('/api/settings/backup')).body;

    // Simula otra instalación: ids distintos para wallets del sistema y redes,
    // otra wallet propia y sin operaciones.
    await pool.query('DELETE FROM raw_transactions'); await pool.query('DELETE FROM transactions');
    await pool.query('DELETE FROM wallet_addresses'); await pool.query(`DELETE FROM wallets WHERE NOT is_system`);
    const nuevoSpot = randomUUID();
    await pool.query(`UPDATE wallets SET id = $1 WHERE name = 'Binance Spot'`, [nuevoSpot]);
    await pool.query(`INSERT INTO wallets (name, type) VALUES ('Solo en este equipo', 'software')`);
    await pool.query(`UPDATE app_config SET value = 'light' WHERE key = 'theme'`);

    runFifoEngineMock.mockClear();
    const res = await request(app).post('/api/settings/backup/restore').send({ backup: original, password: 'contrasena-larga', confirm: true });
    expect(res.status).toBe(200);
    expect(res.body.restored).toMatchObject({ transactions: 2, wallets: enClaro.counts.wallets });
    expect(runFifoEngineMock).toHaveBeenCalledOnce();

    // Las operaciones de Binance Spot apuntan a la wallet local, no al id de la copia.
    const spotTx = await pool.query(`SELECT COUNT(*) FROM transactions WHERE wallet_id = $1`, [nuevoSpot]);
    expect(Number(spotTx.rows[0].count)).toBe(1);
    expect((await pool.query(`SELECT 1 FROM wallets WHERE name = 'Solo en este equipo'`)).rowCount).toBe(0);
    expect((await pool.query(`SELECT notes FROM wallets WHERE name = 'Fría sintética'`)).rows[0].notes).toBe('nota');
    expect((await pool.query(`SELECT value FROM app_config WHERE key = 'theme'`)).rows[0].value).toBe('dark');
    expect((await pool.query(`SELECT linked_tx_id FROM transactions WHERE operation_type = 'DEPOSIT_CRYPTO'`)).rows[0].linked_tx_id).not.toBeNull();
    expect((await pool.query(`SELECT disabled_pairs FROM asset_metadata WHERE symbol = 'SINT'`)).rows[0].disabled_pairs).toEqual(['SINTBTC']);
    expect(await count('raw_transactions')).toBe(1);

    // La copia previa guarda el estado de antes: volver lo recupera.
    const snaps = (await request(app).get('/api/settings/backup/snapshots')).body;
    expect(snaps).toHaveLength(1);
    expect(snaps[0].counts.transactions).toBe(0);
    const sinConfirmar = await request(app).post(`/api/settings/backup/snapshots/${snaps[0].id}/revert`).send({});
    expect(sinConfirmar.status).toBe(400);
    const back = await request(app).post(`/api/settings/backup/snapshots/${snaps[0].id}/revert`).send({ confirm: true });
    expect(back.status).toBe(200);
    expect(await count('transactions')).toBe(0);
    expect((await pool.query(`SELECT 1 FROM wallets WHERE name = 'Solo en este equipo'`)).rowCount).toBe(1);
    expect((await pool.query(`SELECT value FROM app_config WHERE key = 'theme'`)).rows[0].value).toBe('light');
    expect(await count('backup_snapshots')).toBe(0);

    const otraVez = await request(app).post(`/api/settings/backup/snapshots/${snaps[0].id}/revert`).send({ confirm: true });
    expect(otraVez.status).toBe(404);
    const malId = await request(app).post('/api/settings/backup/snapshots/no-es-uuid/revert').send({ confirm: true });
    expect(malId.status).toBe(400);
  });
});
