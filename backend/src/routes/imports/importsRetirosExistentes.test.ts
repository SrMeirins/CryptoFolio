import { describe, expect, it, vi, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { Pool } from 'pg';
import { createTestDatabase, TestDatabase } from '../../test/setup-test-db';

// Retiros ya importados (#330): completar direcciones con el historial de
// retiradas (Binance) o volviendo a subir el CSV (Bitvavo) y reasignar destinos.
// Precios mockeados (sin red); app importada tras fijar DATABASE_URL. Datos sintéticos.
vi.mock('../../modules/prices/binance', async (orig) => ({
  ...(await orig<typeof import('../../modules/prices/binance')>()),
  getHistoricalPriceEur: vi.fn(() => Promise.resolve(1)),
  refreshLivePrices: vi.fn(() => Promise.resolve()),
}));

const BIN = 'User ID,Time,Account,Operation,Coin,Change,Remark';
const RET = 'Time,Coin,Network,Amount,Fee,Address,TXID,Status';
const BITV = 'Timezone,Date,Time,Type,Currency,Amount,Quote Currency,Quote Price,Received / Paid Currency,Received / Paid Amount,Fee currency,Fee amount,Status,Transaction ID,Address';
const HASH = 'e'.repeat(64);
const binance = Buffer.from([BIN, '1,2024-05-01 09:00:00,Spot,Deposit,XRP,20,', '1,2024-05-10 10:20:00,Spot,Withdraw,XRP,-10.2,'].join('\n'));
const retiradas = Buffer.from([RET, `2024-05-10 10:00:00,XRP,XRP,10,0.2,rSinteticaLedger1,${HASH},Completed`].join('\n'));
const bitvavo = Buffer.from([BITV,
  'Europe/Amsterdam,2024-06-01,10:00:00,deposit,ADA,100,,,,,,,Completed,11111111-2222-3333-4444-555555555555,',
  'Europe/Amsterdam,2024-06-05,10:00:00,withdrawal,ADA,-50,,,,,ADA,0.5,Completed,11111111-2222-3333-4444-666666666666,addr1sinteticaBitvavo',
].join('\n'));

let testDb: TestDatabase;
let pool: Pool;
let app: import('express').Express;

describe('retiros ya importados (#330)', () => {
  beforeAll(async () => {
    testDb = await createTestDatabase();
    process.env.DATABASE_URL = testDb.connectionString;
    pool = new Pool({ connectionString: testDb.connectionString });
    const { importCsvFile } = await import('../../modules/csv/importer');
    // Importados ANTES de existir el historial de retiradas: sin dirección y a «Wallets externas».
    await importCsvFile(binance, 'binance.csv', { XRP: '__external__' }, {}, undefined, undefined, 'binance');
    await importCsvFile(bitvavo, 'bitvavo.csv', { ADA: '__external__' }, { [(await import('crypto')).createHash('sha256').update('11111111-2222-3333-4444-555555555555|2024-06-01|10:00:00|deposit|ADA|100').digest('hex')]: 0.3 }, undefined, undefined, 'bitvavo');
    // Simula retiros importados antes de #320, cuando no se guardaba la dirección.
    await pool.query(`UPDATE transactions SET counterparty_address = NULL, counterparty_network_id = NULL, tx_hash = NULL`);
    app = (await import('../../app')).default;
  }, 30000);
  afterAll(async () => {
    await pool.end();
    if (testDb) await testDb.teardown();
  });

  it('subir solo el historial de retiradas empareja los retiros de Binance ya importados', async () => {
    const r = await request(app).post('/api/imports/preview').attach('withdrawals', retiradas, 'retiradas.csv');
    expect(r.status).toBe(200);
    expect(r.body.archivos).toEqual([]);
    expect(r.body.existentes).toHaveLength(1);
    expect(r.body.existentes[0]).toMatchObject({ exchange: 'binance', asset: 'XRP', destinoActual: '__external__', destino: { address: 'rSinteticaLedger1', network: 'XRP Ledger', txHash: HASH } });
  });

  it('volver a subir el CSV de Bitvavo ofrece completar la dirección de sus retiros', async () => {
    const r = await request(app).post('/api/imports/preview').attach('files', bitvavo, 'bitvavo.csv');
    expect(r.body.archivos[0].estado).toBe('sin_novedades');
    expect(r.body.existentes.map((e: { exchange: string; destino: { address: string } }) => [e.exchange, e.destino.address])).toEqual([['bitvavo', 'addr1sinteticaBitvavo']]);
  });

  it('guardar completa direcciones, reasigna el destino a una wallet propia y recalcula el FIFO', async () => {
    const wallet = (await pool.query(`INSERT INTO wallets (name, type, color) VALUES ('Ledger sintética', 'hardware', '#112233') RETURNING id`)).rows[0].id;
    const id = (await request(app).post('/api/imports/preview').attach('withdrawals', retiradas, 'r.csv')).body.existentes[0].id;

    const ajeno = await request(app).post('/api/imports/retiros-existentes')
      .field('reasignaciones', JSON.stringify({ '00000000-0000-0000-0000-000000000000': wallet })).attach('withdrawals', retiradas, 'r.csv');
    expect(ajeno.status).toBe(400);
    const sistema = (await pool.query(`SELECT id FROM wallets WHERE is_system = TRUE AND type = 'exchange' LIMIT 1`)).rows[0].id;
    const malDestino = await request(app).post('/api/imports/retiros-existentes')
      .field('reasignaciones', JSON.stringify({ [id]: sistema })).attach('withdrawals', retiradas, 'r.csv');
    expect(malDestino.status).toBe(400);
    expect((await pool.query(`SELECT counterparty_address FROM transactions WHERE id = $1`, [id])).rows[0].counterparty_address).toBeNull();

    const ok = await request(app).post('/api/imports/retiros-existentes')
      .field('reasignaciones', JSON.stringify({ [id]: wallet })).attach('withdrawals', retiradas, 'r.csv');
    expect(ok.body).toEqual({ direcciones: 1, destinos: 1, fifo: true });
    const fila = (await pool.query(`SELECT counterparty_address, tx_hash, destination_wallet_id FROM transactions WHERE id = $1`, [id])).rows[0];
    expect(fila).toEqual({ counterparty_address: 'rSinteticaLedger1', tx_hash: HASH, destination_wallet_id: wallet });
    // El FIFO ya mueve el lote a la wallet propia.
    expect((await pool.query(`SELECT count(*)::int AS n FROM fifo_lots WHERE wallet_id = $1 AND asset = 'XRP'`, [wallet])).rows[0].n).toBeGreaterThan(0);

    // Ya completado: no vuelve a ofrecerse.
    expect((await request(app).post('/api/imports/preview').attach('withdrawals', retiradas, 'r.csv')).body.existentes).toEqual([]);
  });

  it('solo completar direcciones (sin reasignar) no recalcula el FIFO', async () => {
    const r = await request(app).post('/api/imports/retiros-existentes').attach('files', bitvavo, 'bitvavo.csv');
    expect(r.body).toEqual({ direcciones: 1, destinos: 0, fifo: false });
  });
});
