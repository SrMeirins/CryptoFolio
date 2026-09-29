import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import { createTestDatabase, TestDatabase } from '../test/setup-test-db';

// Migración 024: mismo criterio que la 023 (fifo_lots/fifo_lot_consumptions),
// aplicado a las 4 FK que quedaron con el comportamiento implícito de
// Postgres (NO ACTION, equivalente mudo a RESTRICT). Verifica que el
// comportamiento de bloqueo sigue siendo el mismo tras hacerlo explícito —
// no debería cambiar nada observable, solo la intención queda documentada.
describe('FK restantes (wallet_addresses/transactions/fifo_lots → wallets/networks) → RESTRICT explícito', () => {
  let testDb: TestDatabase;
  let pool: Pool;

  beforeAll(async () => {
    testDb = await createTestDatabase();
    pool = new Pool({ connectionString: testDb.connectionString });
  });
  afterAll(async () => {
    await pool.end();
    if (testDb) await testDb.teardown();
  });

  it('bloquea borrar una network que todavía tiene una dirección de wallet asociada', async () => {
    const wallet = await pool.query(`INSERT INTO wallets (name, type) VALUES ('W', 'exchange') RETURNING id`);
    const network = await pool.query(
      `INSERT INTO networks (name, native_asset) VALUES ('Red test FK', 'TST') RETURNING id`
    );
    await pool.query(
      `INSERT INTO wallet_addresses (wallet_id, network_id, address) VALUES ($1, $2, '0xabc')`,
      [wallet.rows[0].id, network.rows[0].id]
    );

    await expect(pool.query(`DELETE FROM networks WHERE id = $1`, [network.rows[0].id])).rejects.toThrow();
  });

  it('bloquea borrar una wallet que todavía tiene transacciones (wallet_id)', async () => {
    const wallet = await pool.query(`INSERT INTO wallets (name, type) VALUES ('W2', 'exchange') RETURNING id`);
    await pool.query(
      `INSERT INTO transactions (operation_type, timestamp, asset, amount, amount_net, wallet_id)
       VALUES ('BUY', NOW(), 'BTC', 1, 1, $1)`,
      [wallet.rows[0].id]
    );

    await expect(pool.query(`DELETE FROM wallets WHERE id = $1`, [wallet.rows[0].id])).rejects.toThrow();
  });

  it('bloquea borrar una wallet que es destino de una transferencia interna (destination_wallet_id)', async () => {
    const origin = await pool.query(`INSERT INTO wallets (name, type) VALUES ('Origen', 'exchange') RETURNING id`);
    const dest   = await pool.query(`INSERT INTO wallets (name, type) VALUES ('Destino', 'hardware') RETURNING id`);
    await pool.query(
      `INSERT INTO transactions (operation_type, timestamp, asset, amount, amount_net, wallet_id, destination_wallet_id)
       VALUES ('TRANSFER_INTERNAL', NOW(), 'BTC', 1, 1, $1, $2)`,
      [origin.rows[0].id, dest.rows[0].id]
    );

    await expect(pool.query(`DELETE FROM wallets WHERE id = $1`, [dest.rows[0].id])).rejects.toThrow();
  });

  it('bloquea borrar una wallet que todavía tiene lotes FIFO abiertos (fifo_lots.wallet_id)', async () => {
    const wallet = await pool.query(`INSERT INTO wallets (name, type) VALUES ('W3', 'exchange') RETURNING id`);
    const tx = await pool.query(
      `INSERT INTO transactions (operation_type, timestamp, asset, amount, amount_net, wallet_id)
       VALUES ('BUY', NOW(), 'BTC', 1, 1, $1) RETURNING id`,
      [wallet.rows[0].id]
    );
    await pool.query(
      `INSERT INTO fifo_lots (asset, quantity_original, quantity_remaining, cost_basis_eur, price_per_unit_eur, open_transaction_id, opened_at, wallet_id)
       VALUES ('BTC', 1, 1, 100, 100, $1, NOW(), $2)`,
      [tx.rows[0].id, wallet.rows[0].id]
    );

    await expect(pool.query(`DELETE FROM wallets WHERE id = $1`, [wallet.rows[0].id])).rejects.toThrow();
  });

  // Los 4 tests anteriores pasarían igual sin la migración (NO ACTION, el
  // default de Postgres sin especificar, bloquea el borrado exactamente
  // igual que RESTRICT desde el punto de vista de quien consulta) — esta
  // comprobación es la que realmente verifica el cambio: que la constraint
  // tiene RESTRICT explícito en el catálogo, no el default mudo.
  it('las 4 FK tienen confdeltype=r (RESTRICT) explícito en el catálogo de Postgres, no el default implícito', async () => {
    const result = await pool.query(`
      SELECT conrelid::regclass::text AS tabla, conname, confdeltype
      FROM pg_constraint
      WHERE conname IN (
        'wallet_addresses_network_id_fkey',
        'transactions_wallet_id_fkey',
        'transactions_destination_wallet_id_fkey',
        'fifo_lots_wallet_id_fkey'
      )
      ORDER BY conname
    `);

    expect(result.rows).toHaveLength(4);
    for (const row of result.rows) {
      expect(row.confdeltype).toBe('r'); // 'r' = RESTRICT explícito (vs 'a' = NO ACTION implícito)
    }
  });
});
