import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import { createTestDatabase, TestDatabase } from '../../test/setup-test-db';

let testDb: TestDatabase;
let pool: Pool;

const HEADER = 'User ID,Time,Account,Operation,Coin,Change,Remark';

function csv(rows: string[]): string {
  return [HEADER, ...rows].join('\n');
}

async function loadImporterWithTestDb() {
  process.env.DATABASE_URL = testDb.connectionString;
  return import('./importer');
}

describe('importCsvFile — modo degradado ante operaciones desconocidas', () => {
  beforeAll(async () => {
    testDb = await createTestDatabase();
    pool = new Pool({ connectionString: testDb.connectionString });
  });

  afterAll(async () => {
    await pool.end();
    if (testDb) await testDb.teardown();
  });

  // Caso real ya ocurrido 2 veces con este usuario (Inter-Wallet Transfer,
  // Staking Purchase redimido): Binance renombra una operación y el CSV trae
  // una fila con un Operation que el parser no reconoce. Antes de este fix,
  // importCsvFile abortaba el CSV ENTERO — ni siquiera las filas reconocibles
  // se guardaban. Ahora debe importar lo que sí reconoce y reportar el resto.
  it('importa las transacciones reconocidas aunque el CSV tenga una operación desconocida', async () => {
    const { importCsvFile } = await loadImporterWithTestDb();

    const rows = [
      '123,2024-05-10 10:00:00,Spot,Withdraw,BTC,-0.5,',
      '123,2024-05-10 11:00:00,Spot,Operación Inventada Que No Existe,ETH,1,',
    ];
    const buffer = Buffer.from(csv(rows), 'utf-8');

    const result = await importCsvFile(buffer, 'test.csv');

    expect(result.newTransactions).toBe(1);
    expect(result.errors.length).toBe(1);
    expect(result.errors[0]).toMatch(/no reconocido/);

    const stored = await pool.query(
      `SELECT operation_type, asset FROM transactions WHERE asset = 'BTC'`
    );
    expect(stored.rows.length).toBe(1);
    expect(stored.rows[0].operation_type).toBe('WITHDRAW');
  });
});
