import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { Pool } from 'pg';
import { createTestDatabase, TestDatabase } from '../test/setup-test-db';

// Reproduce el hallazgo real: la columna "Coin" de un CSV de exchange no
// tiene whitelist (TEXT libre) y llega tal cual hasta fifo_lots.asset /
// transactions.asset. Un CSV manipulado con un "activo" que empieza por '='
// llegaría sin escapar a los exports CSV si no se sanea (ver csvSafety.ts).
let testDb: TestDatabase;
let pool: Pool;
let app: import('express').Express;

describe('GET /api/fiscal/:year/export — mitigación de CSV Formula Injection', () => {
  const ASSET_MALICIOSO = "=cmd|'/c calc'!A0";

  beforeAll(async () => {
    testDb = await createTestDatabase();
    process.env.DATABASE_URL = testDb.connectionString;
    pool = new Pool({ connectionString: testDb.connectionString });

    const wallet = await pool.query(
      `INSERT INTO wallets (name, type) VALUES ('Wallet test CSV injection', 'hardware') RETURNING id`
    );
    const walletId = wallet.rows[0].id;

    // BUY: abre el lote con el activo "malicioso" (como si viniera de un CSV
    // importado sin whitelist en la columna Coin).
    const buyTx = await pool.query(
      `INSERT INTO transactions (operation_type, timestamp, asset, amount, amount_net, wallet_id, cost_asset, cost_amount)
       VALUES ('BUY', '2025-03-01T10:00:00Z', $1, 10, 10, $2, 'EUR', 100)
       RETURNING id`,
      [ASSET_MALICIOSO, walletId]
    );
    const lot = await pool.query(
      `INSERT INTO fifo_lots (asset, quantity_original, quantity_remaining, cost_basis_eur, price_per_unit_eur, open_transaction_id, opened_at, wallet_id, is_closed)
       VALUES ($1, 10, 0, 100, 10, $2, '2025-03-01T10:00:00Z', $3, TRUE)
       RETURNING id`,
      [ASSET_MALICIOSO, buyTx.rows[0].id, walletId]
    );

    // SELL: consume el lote entero, genera el evento fiscal del año 2025.
    const sellTx = await pool.query(
      `INSERT INTO transactions (operation_type, timestamp, asset, amount, amount_net, wallet_id, cost_asset, cost_amount)
       VALUES ('SELL', '2025-06-01T10:00:00Z', $1, 10, 10, $2, 'EUR', 150)
       RETURNING id`,
      [ASSET_MALICIOSO, walletId]
    );
    await pool.query(
      `INSERT INTO fifo_lot_consumptions
         (lot_id, consuming_transaction_id, quantity_consumed, cost_basis_consumed_eur, proceeds_eur, gain_loss_eur, fiscal_event_type, consumed_at)
       VALUES ($1, $2, 10, 100, 150, 50, 'GAIN', '2025-06-01T10:00:00Z')`,
      [lot.rows[0].id, sellTx.rows[0].id]
    );

    app = (await import('../app')).default;
  });

  afterAll(async () => {
    await pool.end();
    if (testDb) await testDb.teardown();
  });

  it('el CSV Modelo 100 no contiene la fórmula sin escapar', async () => {
    const res = await request(app).get('/api/fiscal/2025/export?format=csv');
    expect(res.status).toBe(200);
    const csv = res.text;

    // No debe aparecer el payload crudo empezando por '=' en ninguna línea
    // (eso es lo que Excel/LibreOffice interpretarían como fórmula).
    expect(csv).not.toMatch(/;=cmd\|/);

    // El activo saneado sí debe estar presente, con la comilla simple que
    // fuerza texto delante (el payload no lleva ';' propio ni comillas
    // dobles, así que no dispara además el envolvido RFC 4180).
    expect(csv).toContain(`;'${ASSET_MALICIOSO};`);
  });

  it('el CSV Renta Web no contiene la fórmula sin escapar', async () => {
    const res = await request(app).get('/api/fiscal/2025/export?format=rentaweb');
    expect(res.status).toBe(200);
    const csv = res.text;

    expect(csv).not.toMatch(/;=cmd\|/);
    expect(csv).toContain(`;'${ASSET_MALICIOSO};`);
  });
});
