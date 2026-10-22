import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import type { Pool } from 'pg';
import { createTestDatabase, TestDatabase } from '../../test/setup-test-db';

// GET /, /stats y /facets del Historial (#346): validación, valoración con el
// FIFO (y su respaldo estimado), flujos de entradas/salidas y estadísticas.
// Datos sintéticos: cada transacción cubre una vía de valoración distinta.
let testDb: TestDatabase;
let pool: Pool;
let app: import('express').Express;

const RECENT = new Date(Date.now() - 20 * 86_400_000);
RECENT.setUTCHours(12, 0, 0, 0);
const DAY = RECENT.toISOString().slice(0, 10);
const at = (min: number) => new Date(RECENT.getTime() + min * 60_000).toISOString();
const ids: Record<string, string> = {};

type TxFields = Record<string, unknown>;
async function tx(key: string, f: TxFields): Promise<string> {
  const cols = Object.keys(f);
  const r = await pool.query(
    `INSERT INTO transactions (${cols.join(', ')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING id`,
    Object.values(f),
  );
  ids[key] = r.rows[0].id;
  return ids[key];
}
async function lot(openTx: string, asset: string, wallet: string, ppu: number, qty: number, feeEur = 0): Promise<string> {
  const r = await pool.query(
    `INSERT INTO fifo_lots (asset, quantity_original, quantity_remaining, cost_basis_eur, price_per_unit_eur, fee_eur, open_transaction_id, opened_at, wallet_id)
     VALUES ($1, $2, $2, $3, $4, $5, $6, NOW(), $7) RETURNING id`,
    [asset, qty, ppu * qty, ppu, feeEur, openTx, wallet],
  );
  return r.rows[0].id;
}
async function consume(lotId: string, consumingTx: string, qty: number, proceeds: number, event = 'GAIN') {
  await pool.query(
    `INSERT INTO fifo_lot_consumptions (lot_id, consuming_transaction_id, quantity_consumed, cost_basis_consumed_eur, proceeds_eur, gain_loss_eur, fiscal_event_type, consumed_at)
     VALUES ($1, $2, $3, 0, $4, $5, $6, NOW())`,
    [lotId, consumingTx, qty, proceeds, proceeds, event],
  );
}
const byId = (rows: { id: string }[], key: string) => rows.find(r => r.id === ids[key]) as Record<string, unknown>;

describe('routes/transactions — listado, stats y facetas', () => {
  beforeAll(async () => {
    testDb = await createTestDatabase();
    process.env.DATABASE_URL = testDb.connectionString;
    // Pool de la app (con su manejador de errores): uno propio sin manejador
    // provocaba un error no capturado al cortar el teardown sus conexiones.
    pool = (await import('../../db/client')).pool;

    const a = (await pool.query(`INSERT INTO wallets (name, type) VALUES ('Exchange test', 'exchange') RETURNING id`)).rows[0].id;
    const b = (await pool.query(`INSERT INTO wallets (name, type) VALUES ('Fría test', 'hardware') RETURNING id`)).rows[0].id;
    const base = { wallet_id: a };

    // 1. Compra con EUR → «coste», comisión en EUR.
    await tx('buyEur', { ...base, operation_type: 'BUY', timestamp: at(0), asset: 'BTC', amount: 1, amount_net: 1, cost_asset: 'EUR', cost_amount: 100, fee_asset: 'EUR', fee_amount: 1, manually_added: true, account: 'Spot' });
    const btcLot = await lot(ids.buyEur, 'BTC', a, 101, 1, 1);
    // 5. Depósito cripto → valor del lote que abre.
    await tx('depositBnb', { ...base, operation_type: 'DEPOSIT_CRYPTO', timestamp: at(1), asset: 'BNB', amount: 1, amount_net: 1 });
    const bnbLot = await lot(ids.depositBnb, 'BNB', a, 250, 1);
    // 2. Swap BTC → ETH con comisión en BNB: lote ETH (valor sin la comisión) y comisión del lote.
    await tx('swap', { ...base, operation_type: 'BUY', timestamp: at(2), asset: 'ETH', amount: 2, amount_net: 2, cost_asset: 'BTC', cost_amount: 0.5, price_per_unit: 0.25, fee_asset: 'BNB', fee_amount: 0.01, account: 'Bitvavo' });
    await lot(ids.swap, 'ETH', a, 30, 2, 4);
    await consume(btcLot, ids.swap, 0.5, 60);
    // 3. Venta BTC → USDT: proceeds del FIFO; comisión en USDT estimada con el cierre.
    await tx('sell', { ...base, operation_type: 'SELL', timestamp: at(3), asset: 'BTC', amount: 0.5, amount_net: 0.5, cost_asset: 'USDT', cost_amount: 30, price_per_unit: 60, fee_asset: 'USDT', fee_amount: 0.1 });
    await consume(btcLot, ids.sell, 0.5, 28);
    // 4. Fila de comisión → proceeds del lote BNB consumido.
    await tx('feeRow', { ...base, operation_type: 'FEE_EXCHANGE', timestamp: at(4), asset: 'BNB', amount: 0.02, amount_net: 0.02, fee_asset: 'BNB', fee_amount: 0.02 });
    await consume(bnbLot, ids.feeRow, 0.02, 5);
    // 6. Retiro a una wallet propia → estimado con el cierre, neutro en los flujos.
    await tx('withdrawOwn', { ...base, operation_type: 'WITHDRAW', timestamp: at(5), asset: 'XRP', amount: 10, amount_net: 10, destination_wallet_id: b, notes: 'sin porcentaje' });
    // 7. Retiro de EUR al banco → coste directo, salida.
    await tx('withdrawFiat', { ...base, operation_type: 'WITHDRAW_FIAT', timestamp: at(6), asset: 'EUR', amount: 20, amount_net: 20, notes: 'a_b' });
    // 8. Transferencia sin ningún precio → sin_precio.
    await tx('noPrice', { ...base, operation_type: 'TRANSFER_INTERNAL', timestamp: at(7), asset: 'DOGE', amount: 5, amount_net: 5, destination_wallet_id: b, notes: '50% descuento <b>x</b>' });
    // 9. Pérdida → «otras salidas», no venta.
    await tx('lost', { ...base, operation_type: 'LOST', timestamp: at(8), asset: 'LUNC', amount: 3, amount_net: 3 });
    // 10. Venta con lotes insuficientes → no usa el FIFO parcial; estima con price_cache.
    await tx('shortfall', { ...base, operation_type: 'SELL', timestamp: at(9), asset: 'ADA', amount: 100, amount_net: 100, cost_asset: 'USDT', cost_amount: 50 });
    const adaLot = await lot(ids.depositBnb, 'ADA', a, 0.2, 10);
    await consume(adaLot, ids.shortfall, 10, 3);
    // 12. Depósito EUR a las 00:30 hora peninsular del 11/03/2024 (23:30Z del día 10).
    await tx('midnight', { ...base, operation_type: 'DEPOSIT_FIAT', timestamp: '2024-03-10T23:30:00Z', asset: 'EUR', amount: 10, amount_net: 10 });

    await pool.query(
      `INSERT INTO price_close_madrid (asset, close_date, price_eur, source) VALUES ('XRP', $1, 0.5, 'okx_1d'), ('USDT', $1, 0.9, 'okx_1d')`, [DAY]);
    await pool.query(
      `INSERT INTO price_cache (asset, price_eur, source, price_date) VALUES ('ADA', 0.3, 'binance', $1), ('USDT', 0.8, 'binance', $1)`, [DAY]);

    const { default: router } = await import('./index');
    app = express();
    app.use('/api/transactions', router);
  });

  afterAll(async () => {
    if (testDb) await testDb.teardown();
  });

  describe('GET / — validación', () => {
    it.each([
      ['limit=500', 'limit'],
      ['limit=abc', 'limit'],
      ['offset=-1', 'offset'],
      ["wallet_id=x' OR 1=1 --", 'wallet_id'],
      ['import_id=abc', 'import_id'],
      ["type=BUY' OR '1'='1", 'type'],
      ['date_from=2026-02-30', 'date_from'],
      ['manually_added=yes', 'manually_added'],
      ['foo=1', 'Unrecognized'],
    ])('%s → 400 legible', async (qs, campo) => {
      const res = await request(app).get(`/api/transactions?${qs}`);
      expect(res.status).toBe(400);
      expect(res.body.error).toContain(campo);
    });

    it('/stats valida la moneda', async () => {
      expect((await request(app).get('/api/transactions/stats?currency=GBP')).status).toBe(400);
    });
  });

  describe('GET / — filtros', () => {
    it('sin filtros devuelve todas, de la más reciente a la más antigua', async () => {
      const res = await request(app).get('/api/transactions');
      expect(res.status).toBe(200);
      expect(res.body.total).toBe(11);
      expect(res.body.transactions[0].id).toBe(ids.shortfall);
    });

    it('respeta limit/offset y devuelve el total filtrado', async () => {
      const res = await request(app).get('/api/transactions?limit=2&offset=1');
      expect(res.body.transactions).toHaveLength(2);
      expect(res.body.total).toBe(11);
      expect(res.body.limit).toBe(2);
    });

    it('filtra por tipo, activo (sin distinguir mayúsculas) y manuales', async () => {
      expect((await request(app).get('/api/transactions?type=SELL')).body.total).toBe(2);
      expect((await request(app).get('/api/transactions?asset=btc')).body.total).toBe(2);
      expect((await request(app).get('/api/transactions?manually_added=true')).body.total).toBe(1);
    });

    it('% y _ en la búsqueda se buscan como texto literal', async () => {
      const pct = await request(app).get('/api/transactions?search=%25');
      expect(pct.body.transactions.map((t: { id: string }) => t.id)).toEqual([ids.noPrice]);
      const und = await request(app).get('/api/transactions?search=_');
      expect(und.body.transactions.map((t: { id: string }) => t.id)).toEqual([ids.withdrawFiat]);
    });

    it('las notas con HTML se devuelven tal cual (el frontend las pinta como texto)', async () => {
      const res = await request(app).get('/api/transactions?search=descuento');
      expect(res.body.transactions[0].notes).toBe('50% descuento <b>x</b>');
    });

    it('el rango de fechas usa días locales (Europe/Madrid), no UTC', async () => {
      expect((await request(app).get('/api/transactions?date_to=2024-03-10')).body.total).toBe(0);
      const dia11 = await request(app).get('/api/transactions?date_from=2024-03-11&date_to=2024-03-11');
      expect(dia11.body.transactions.map((t: { id: string }) => t.id)).toEqual([ids.midnight]);
    });
  });

  describe('GET / — valoración', () => {
    let rows: { id: string }[];
    beforeAll(async () => { rows = (await request(app).get('/api/transactions?limit=200')).body.transactions; });

    it('compra con EUR: coste directo y comisión en EUR', () => {
      expect(byId(rows, 'buyEur')).toMatchObject({ value_eur: 100, value_source: 'coste', fee_value_eur: 1, fee_value_source: 'coste' });
    });

    it('swap cripto↔cripto: valor del lote FIFO sin la comisión, y comisión del lote', () => {
      // 2 × 30 − 4: el precio por unidad del lote incluye la comisión.
      expect(byId(rows, 'swap')).toMatchObject({ value_eur: 56, value_source: 'fifo', fee_value_eur: 4, fee_value_source: 'fifo' });
    });

    it('venta: proceeds del FIFO; comisión en el activo recibido estimada con el cierre', () => {
      const r = byId(rows, 'sell');
      expect(r).toMatchObject({ value_eur: 28, value_source: 'fifo', fee_value_source: 'estimado' });
      expect(r.fee_value_eur).toBeCloseTo(0.09, 10);
    });

    it('fila de comisión y depósito cripto: proceeds y lote del FIFO', () => {
      expect(byId(rows, 'feeRow')).toMatchObject({ value_eur: 5, value_source: 'fifo' });
      expect(byId(rows, 'depositBnb')).toMatchObject({ value_eur: 250, value_source: 'fifo' });
    });

    it('retiro sin FIFO de mercado: estimado con el cierre diario', () => {
      expect(byId(rows, 'withdrawOwn')).toMatchObject({ value_eur: 5, value_source: 'estimado' });
    });

    it('con lotes insuficientes no usa el valor FIFO parcial: estima con price_cache', () => {
      const r = byId(rows, 'shortfall');
      expect(r.value_source).toBe('estimado');
      expect(r.value_eur).toBeCloseTo(30, 10);
    });

    it('sin ningún precio: valor nulo y motivo', () => {
      expect(byId(rows, 'noPrice')).toMatchObject({ value_eur: null, value_source: 'sin_precio', fee_value_eur: null, fee_value_source: null });
    });
  });

  describe('GET / — orden en el servidor (#349)', () => {
    const ordenIds = async (qs: string) =>
      (await request(app).get(`/api/transactions?limit=200&${qs}`)).body.transactions.map((t: { id: string }) => t.id) as string[];
    const k = (...keys: string[]) => keys.map(key => ids[key]);

    it('por valor desc: el mayor de todo lo filtrado primero y los sin precio al final', async () => {
      const orden = await ordenIds('sort=valor&dir=desc');
      expect(orden[0]).toBe(ids.depositBnb);
      // Sin precio al final, desempatadas por fecha descendente.
      expect(orden.slice(-2)).toEqual(k('lost', 'noPrice'));
    });

    it('por valor asc: empates por fecha descendente y los sin precio también al final', async () => {
      const orden = await ordenIds('sort=valor&dir=asc');
      // feeRow y withdrawOwn valen 5: primero el más reciente.
      expect(orden.slice(0, 2)).toEqual(k('withdrawOwn', 'feeRow'));
      expect(orden.slice(-2)).toEqual(k('lost', 'noPrice'));
    });

    it('por tipo: alfabético por la etiqueta visible; por activo: alfabético', async () => {
      expect((await ordenIds('sort=tipo&dir=asc'))[0]).toBe(ids.feeRow);   // «Comisión exchange»
      expect((await ordenIds('sort=activo&dir=asc'))[0]).toBe(ids.shortfall); // ADA
    });

    it.each(['fecha', 'valor', 'activo', 'tipo'])('paginar por %s no repite ni omite filas', async (sort) => {
      for (const dir of ['asc', 'desc']) {
        const vistos: string[] = [];
        for (let offset = 0; offset < 11; offset += 3) {
          const res = await request(app).get(`/api/transactions?sort=${sort}&dir=${dir}&limit=3&offset=${offset}`);
          vistos.push(...res.body.transactions.map((t: { id: string }) => t.id));
        }
        expect(vistos).toHaveLength(11);
        expect(new Set(vistos).size).toBe(11);
      }
    });

    it('sort y dir inválidos → 400', async () => {
      expect((await request(app).get('/api/transactions?sort=notes')).status).toBe(400);
      expect((await request(app).get('/api/transactions?dir=sideways')).status).toBe(400);
    });

    it('cada fila trae el archivo de origen y el hash para la trazabilidad', async () => {
      const rows = (await request(app).get('/api/transactions')).body.transactions;
      expect(rows[0]).toHaveProperty('import_filename');
      expect(rows[0]).toHaveProperty('tx_hash');
    });
  });

  describe('GET / — filtros avanzados (#366)', () => {
    const totalDe = async (qs: string) => (await request(app).get(`/api/transactions?${qs}`)).body.total as number;

    it('varios tipos y varios activos a la vez', async () => {
      expect(await totalDe('type=SELL,LOST')).toBe(3);        // venta, venta con faltante y pérdida
      expect(await totalDe('asset=btc,eth')).toBe(3);         // compra y venta de BTC, swap a ETH
    });

    it('rango de importe en EUR: excluye las filas sin precio', async () => {
      expect(await totalDe('value_min=50')).toBe(3);          // 100, 56 y 250
      expect(await totalDe('value_max=5')).toBe(2);           // las dos de 5 €; las sin precio no entran
    });

    it('rango de importe en USD con el tipo de cada fecha (1 / 0,8)', async () => {
      expect(await totalDe('currency=USD&value_min=125')).toBe(2);   // 100 € = 125 $ y 250 €
    });

    it('los flujos respetan el rango de importe', async () => {
      const { flows } = (await request(app).get('/api/transactions?value_min=100')).body;
      expect(flows.EUR).toEqual({ entradas: 350, salidas: 0 });
    });

    it('la búsqueda encuentra por hash on-chain y por nombre del archivo de origen', async () => {
      await pool.query(`UPDATE transactions SET tx_hash = 'abcd1234ffee99' WHERE id = $1`, [ids.withdrawOwn]);
      const imp = (await pool.query(
        `INSERT INTO csv_imports (filename, file_hash, exchange) VALUES ('export_sintetico_2026.csv', 'hash-sintetico-366', 'binance') RETURNING id`)).rows[0].id;
      await pool.query(`UPDATE transactions SET import_id = $1 WHERE id = $2`, [imp, ids.lost]);
      const porHash = (await request(app).get('/api/transactions?search=FFEE99')).body.transactions;
      expect(porHash.map((t: { id: string }) => t.id)).toEqual([ids.withdrawOwn]);
      const porArchivo = (await request(app).get('/api/transactions?search=sintetico_2026')).body.transactions;
      expect(porArchivo.map((t: { id: string }) => t.id)).toEqual([ids.lost]);
    });

    it('listas manipuladas → 400 sin llegar a SQL', async () => {
      expect((await request(app).get("/api/transactions?type=BUY,'%20OR%201=1--")).status).toBe(400);
      expect((await request(app).get('/api/transactions?value_min=1;DROP')).status).toBe(400);
    });
  });

  describe('GET / — flujos', () => {
    it('separa entradas y salidas; los movimientos entre wallets propias no cuentan', async () => {
      const { flows } = (await request(app).get('/api/transactions')).body;
      // Entradas: compra 100 + swap 56 + depósito BNB 250 + depósito EUR 10.
      expect(flows.EUR.entradas).toBeCloseTo(416, 8);
      // Salidas: venta 28 + comisión 5 + retiro al banco 20 + venta estimada 30 (la pérdida no tiene precio).
      expect(flows.EUR.salidas).toBeCloseTo(83, 8);
      // USD con el tipo de USDT más cercano (1 / 0.8).
      expect(flows.USD.entradas).toBeCloseTo(416 / 0.8, 6);
    });

    it('los flujos siguen a los filtros', async () => {
      const { flows } = (await request(app).get('/api/transactions?type=SELL')).body;
      expect(flows.EUR).toEqual({ entradas: 0, salidas: 58 });
    });
  });

  describe('GET /stats', () => {
    it('definiciones coherentes de Invertido, Ventas y Comisiones', async () => {
      const res = await request(app).get('/api/transactions/stats');
      expect(res.status).toBe(200);
      expect(res.body.totals).toMatchObject({
        total_ops: 11,
        total_invested: 100,   // solo compras pagadas con fiat
        total_fiat_buys: 1,
        total_buys: 2,         // incluye el swap
        total_sells: 2,        // la pérdida no es una venta
        total_sold: 58,
        total_manual: 1,
        total_fee_ops: 4,      // 3 comisiones en columna + 1 fila FEE_EXCHANGE
        fees_sin_valor: 0,
      });
      expect(res.body.totals.total_fees_eur).toBeCloseTo(1 + 4 + 0.09 + 5, 8);
    });

    it('el gráfico mensual separa ventas y otras salidas y cuadra con las tarjetas', async () => {
      const { monthly } = (await request(app).get('/api/transactions/stats')).body;
      const mes = monthly.find((m: { mes: string }) => m.mes === DAY.slice(0, 7));
      expect(mes).toMatchObject({ compras: 2, ventas: 2, otras_salidas: 1, eur_invertido: 100 });
    });

    it('comisiones por activo valoradas', async () => {
      const { fees } = (await request(app).get('/api/transactions/stats')).body;
      const bnb = fees.find((f: { asset: string }) => f.asset === 'BNB');
      expect(bnb).toMatchObject({ ops: 2, total_eur: 9 });
    });
  });

  describe('GET /facets', () => {
    it('lista las cuentas, activos y tipos presentes en los datos', async () => {
      const res = await request(app).get('/api/transactions/facets');
      expect(res.status).toBe(200);
      expect(res.body.accounts).toEqual(['Bitvavo', 'Spot']);
      expect(res.body.assets).toContain('DOGE');
      expect(res.body.types).toContain('FEE_EXCHANGE');
    });
  });
});
