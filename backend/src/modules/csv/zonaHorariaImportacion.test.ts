import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'crypto';
import { createTestDatabase, TestDatabase } from '../../test/setup-test-db';

// Corregir la zona horaria de una importación de Binance (#599). Datos sintéticos; sin red.
vi.mock('../prices/binance', () => ({
  fetchVelas: vi.fn(async () => { throw new Error('sin red en el test'); }),
  isDefinitiveNoData: () => false,
  getHistoricalPriceEur: vi.fn(async () => 1),
}));

let testDb: TestDatabase;
let db: typeof import('../../db/client')['db'];
let pool: typeof import('../../db/client')['pool'];
let mod: typeof import('./zonaHorariaImportacion');
let importId: string;
const ids: Record<string, string> = {};

async function tx(clave: string, ts: string, editada = false) {
  const id = randomUUID();
  ids[clave] = id;
  const walletId = (await db.query(`SELECT id FROM wallets WHERE name = 'Binance Spot'`)).rows[0].id;
  await db.query(
    `INSERT INTO transactions (id, import_id, operation_type, timestamp, asset, amount, amount_net, cost_asset, cost_amount, wallet_id)
     VALUES ($1, $2, 'BUY', $3, 'ABC', 1, 1, 'USDT', 10, $4)`, [id, importId, ts, walletId]);
  // Editada a mano: la hora actual difiere de la importada (#378).
  if (editada) {
    await db.query(`UPDATE transactions SET original_import = jsonb_build_object('timestamp', timestamp, 'amount', amount),
      timestamp = timestamp + interval '3 days' WHERE id = $1`, [id]);
  }
  await db.query(
    `INSERT INTO raw_transactions (import_id, user_id, time, account, operation, coin, change, row_hash, transaction_id)
     VALUES ($1, '', $2, 'Spot', 'BUY', 'ABC', 1, $3, $4)`, [importId, ts, `h-${clave}`, id]);
}

const hora = async (clave: string) => (await db.query(`SELECT timestamp FROM transactions WHERE id = $1`, [ids[clave]])).rows[0].timestamp.toISOString();
const original = async (clave: string) => (await db.query(`SELECT (original_import->>'timestamp')::timestamptz AS t FROM transactions WHERE id = $1`, [ids[clave]])).rows[0].t.toISOString();
const bruto = async (clave: string) => (await db.query(`SELECT time FROM raw_transactions WHERE row_hash = $1`, [`h-${clave}`])).rows[0].time.toISOString();

beforeAll(async () => {
  testDb = await createTestDatabase();
  process.env.DATABASE_URL = testDb.connectionString;
  const dbClient = await import('../../db/client');
  db = dbClient.db;
  pool = dbClient.pool;
  mod = await import('./zonaHorariaImportacion');
  importId = (await db.query(`INSERT INTO csv_imports (filename, file_hash, exchange) VALUES ('b.csv', 'h', 'binance') RETURNING id`)).rows[0].id;
  // En Madrid (la zona por defecto), 00:30 del 1 de enero de 2025 es 23:30 UTC del 31.
  await tx('anio', '2024-12-31T23:30:00Z');
  await tx('normal', '2025-03-01T12:00:00Z');
  await tx('editada', '2025-03-02T12:00:00Z', true);
}, 30000);

afterAll(async () => {
  await pool.end();
  await testDb.teardown();
});

describe('zona horaria de una importación (#599)', () => {
  it('impacto: cuántas se desplazan, cuántas se respetan y cuántas cambian de día o de año', async () => {
    expect(await mod.impactoZonaHoraria(importId, 2)).toEqual({ desplazadas: 2, respetadas: 1, cambianDia: 1, cambianAnio: 1 });
    expect(await mod.impactoZonaHoraria(importId, 0)).toEqual({ desplazadas: 2, respetadas: 1, cambianDia: 0, cambianAnio: 0 });
  });

  it('aplicar UTC+2: copia previa, desplaza 2 h las no editadas y sus filas en bruto, y guarda el desfase', async () => {
    const antesEditada = await hora('editada');
    const r = await mod.aplicarZonaHoraria(importId, 2);
    expect(r.copiaPrevia).toMatch(/^[0-9a-f-]{36}$/);
    expect(await hora('normal')).toBe('2025-03-01T10:00:00.000Z');
    expect(await bruto('normal')).toBe('2025-03-01T10:00:00.000Z');
    // La editada conserva su hora; su copia del original se desplaza igual.
    expect(await hora('editada')).toBe(antesEditada);
    expect(await original('editada')).toBe('2025-03-02T10:00:00.000Z');
    expect((await db.query('SELECT desfase_horas FROM csv_imports WHERE id = $1', [importId])).rows[0].desfase_horas).toBe(2);
    expect((await db.query('SELECT count(*)::int AS n FROM backup_snapshots')).rows[0].n).toBe(1);
  });

  it('volver a UTC deshace el desplazamiento', async () => {
    await mod.aplicarZonaHoraria(importId, 0);
    expect(await hora('normal')).toBe('2025-03-01T12:00:00.000Z');
    expect(await hora('anio')).toBe('2024-12-31T23:30:00.000Z');
    expect(await original('editada')).toBe('2025-03-02T12:00:00.000Z');
  });

  it('estado: sin red, la detección queda sin datos y se ve el desfase actual', async () => {
    expect(await mod.estadoZonaHoraria(importId)).toMatchObject({ exchange: 'binance', desfaseActual: 0, deteccion: { confianza: 'sin_datos' } });
  });

  it('errores: importación inexistente y CSV que sí trae su zona', async () => {
    await expect(mod.impactoZonaHoraria(randomUUID(), 2)).rejects.toMatchObject({ status: 404 });
    const bitvavo = (await db.query(`INSERT INTO csv_imports (filename, file_hash, exchange) VALUES ('v.csv', 'h2', 'bitvavo') RETURNING id`)).rows[0].id;
    await expect(mod.aplicarZonaHoraria(bitvavo, 2)).rejects.toMatchObject({ status: 400 });
    expect(mod.desfaseValido(14)).toBe(true);
    expect(mod.desfaseValido(15)).toBe(false);
    expect(mod.desfaseValido(1.5)).toBe(false);
  });
});

describe('parser de Binance con zona horaria (#599)', () => {
  it('resta el desfase a la hora y no cambia el hash de la fila', async () => {
    const { parseBinanceCsv } = await import('./parser');
    const csv = ['User ID,Time,Account,Operation,Coin,Change,Remark', '1,2024-05-10 10:00:00,Spot,Deposit,ABC,1,'].join('\n');
    const utc = await parseBinanceCsv(csv);
    const mas2 = await parseBinanceCsv(csv, { desfaseHoras: 2 });
    expect(new Date(utc.transactions[0].timestamp).toISOString()).toBe('2024-05-10T10:00:00.000Z');
    expect(new Date(mas2.transactions[0].timestamp).toISOString()).toBe('2024-05-10T08:00:00.000Z');
    // Misma fila, mismo hash: una reimportación con otra zona se sigue reconociendo como repetida.
    expect(mas2.transactions[0].rawRowHashes).toEqual(utc.transactions[0].rawRowHashes);
  });
});
