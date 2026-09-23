import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'crypto';
import { createTestDatabase, TestDatabase } from '../../test/setup-test-db';

// Mockeamos el proveedor de precios: los tests no deben depender de red externa,
// y así controlamos el precio exacto para verificar la aritmética del motor.
// Precio por defecto 100 salvo activos con precio propio definido (para poder
// verificar aritmética exacta en escenarios con varios activos a la vez).
const MOCK_PRICES: Record<string, number> = { BNB: 500 };
vi.mock('../prices/binance', () => ({
  getHistoricalPriceEur: vi.fn((asset: string) => Promise.resolve(MOCK_PRICES[asset] ?? 100)),
}));

let testDb: TestDatabase;
let db: typeof import('../../db/client')['db'];
let pool: typeof import('../../db/client')['pool'];
let runFifoEngine: typeof import('./engine')['runFifoEngine'];
let walletId: string;
let strategyWalletId: string;

beforeAll(async () => {
  testDb = await createTestDatabase();
  process.env.DATABASE_URL = testDb.connectionString;

  // Import dinámico: db/client.ts lee DATABASE_URL al cargarse (crea el Pool),
  // así que debe importarse DESPUÉS de fijar la variable de entorno al valor de test.
  const dbClient = await import('../../db/client');
  db = dbClient.db;
  pool = dbClient.pool;
  ({ runFifoEngine } = await import('./engine'));

  const walletRes = await db.query(`SELECT id FROM wallets WHERE name = 'Binance Spot'`);
  walletId = walletRes.rows[0].id;
  const strategyRes = await db.query(`SELECT id FROM wallets WHERE name = 'Binance Strategy'`);
  strategyWalletId = strategyRes.rows[0].id;
}, 30000);

afterAll(async () => {
  await pool.end();
  await testDb.teardown();
});

async function insertTx(overrides: Partial<{
  operation_type: string; timestamp: string; asset: string; amount: number; amount_net: number;
  cost_asset: string | null; cost_amount: number | null;
  fee_asset: string | null; fee_amount: number | null;
  wallet_id: string; destination_wallet_id: string | null; destination_pending: boolean;
}>) {
  const tx = {
    id: randomUUID(),
    operation_type: 'BUY',
    timestamp: new Date().toISOString(),
    asset: 'BTC',
    amount: 1,
    amount_net: 1,
    cost_asset: 'EUR',
    cost_amount: 100,
    fee_asset: null as string | null,
    fee_amount: null as number | null,
    wallet_id: walletId,
    destination_wallet_id: null as string | null,
    destination_pending: false,
    ...overrides,
  };
  await db.query(
    `INSERT INTO transactions (id, operation_type, timestamp, asset, amount, amount_net, cost_asset, cost_amount, fee_asset, fee_amount, wallet_id, destination_wallet_id, destination_pending, account)
     VALUES ($1, $2::operation_type, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'Spot')`,
    [tx.id, tx.operation_type, tx.timestamp, tx.asset, tx.amount, tx.amount_net, tx.cost_asset, tx.cost_amount, tx.fee_asset, tx.fee_amount, tx.wallet_id, tx.destination_wallet_id, tx.destination_pending]
  );
  return tx.id;
}

async function clearTransactions() {
  await db.query('DELETE FROM fifo_lot_consumptions');
  await db.query('DELETE FROM fifo_lots');
  await db.query('DELETE FROM transactions');
}

describe('runFifoEngine — atomicidad', () => {
  it('un fallo dentro de la transacción hace ROLLBACK y no deja cambios parciales', async () => {
    // Estado "antes": un lote real ya existente, como si fuera de una ejecución previa exitosa.
    await clearTransactions();
    const priorTxId = await insertTx({ asset: 'ETH', amount: 2, amount_net: 2, cost_amount: 200 });
    await db.query(
      `INSERT INTO fifo_lots (asset, quantity_original, quantity_remaining, cost_basis_eur, price_per_unit_eur, fee_eur, open_transaction_id, opened_at, wallet_id)
       VALUES ('ETH', 2, 2, 200, 100, 0, $1, NOW(), $2)`,
      [priorTxId, walletId]
    );

    // Verificamos el mecanismo genérico de atomicidad que runFifoEngine ahora usa
    // (una única transacción envolvente): si algo falla a mitad, todo debe revertirse,
    // incluido el DELETE inicial — no solo la reconstrucción.
    await expect(
      db.transaction(async (client) => {
        await client.query('DELETE FROM fifo_lot_consumptions');
        await client.query('DELETE FROM fifo_lots');
        await client.query('INSERT INTO fifo_lots (asset, quantity_original, quantity_remaining, cost_basis_eur, price_per_unit_eur, fee_eur, open_transaction_id, opened_at, wallet_id) VALUES ($1,1,1,1,1,0,$2,NOW(),$3)', ['BTC', priorTxId, walletId]);
        throw new Error('fallo simulado a mitad de la reconstrucción');
      })
    ).rejects.toThrow('fallo simulado');

    // El lote de ETH que existía ANTES debe seguir intacto — ni borrado ni sustituido.
    const lots = await db.query(`SELECT asset, quantity_remaining FROM fifo_lots`);
    expect(lots.rows).toHaveLength(1);
    expect(lots.rows[0].asset).toBe('ETH');
    expect(Number(lots.rows[0].quantity_remaining)).toBe(2);
  });

  it('runFifoEngine reconstruye correctamente lotes reales tras un ciclo BUY + SELL (regresión del refactor)', async () => {
    await clearTransactions();
    await insertTx({ operation_type: 'BUY', asset: 'BTC', amount: 1, amount_net: 1, cost_asset: 'EUR', cost_amount: 100, timestamp: '2024-01-01T00:00:00Z' });
    await insertTx({ operation_type: 'SELL', asset: 'BTC', amount: 0.4, amount_net: 0.4, cost_asset: 'EUR', cost_amount: 60, timestamp: '2024-02-01T00:00:00Z' });

    const result = await runFifoEngine();

    expect(result.errors).toEqual([]);
    expect(result.lotsCreated).toBe(1);
    expect(result.lotsConsumed).toBe(1);

    const lots = await db.query(`SELECT quantity_original, quantity_remaining, is_closed FROM fifo_lots WHERE asset = 'BTC'`);
    expect(lots.rows).toHaveLength(1);
    expect(Number(lots.rows[0].quantity_original)).toBe(1);
    expect(Number(lots.rows[0].quantity_remaining)).toBeCloseTo(0.6, 6);
    expect(lots.rows[0].is_closed).toBe(false);

    // Coste 100€ por 1 BTC → 60€/0.4 BTC vendido = proceeds 60, coste proporcional 40 → ganancia 20€
    const consumptions = await db.query(`SELECT gain_loss_eur, fiscal_event_type FROM fifo_lot_consumptions`);
    expect(consumptions.rows).toHaveLength(1);
    expect(Number(consumptions.rows[0].gain_loss_eur)).toBeCloseTo(20, 6);
    expect(consumptions.rows[0].fiscal_event_type).toBe('GAIN');
  });
});

describe('consumeLots — shortfall', () => {
  it('reporta un error cuando se vende más cantidad de la que hay en lotes abiertos, en vez de fallar en silencio', async () => {
    await clearTransactions();
    await insertTx({ operation_type: 'BUY', asset: 'BTC', amount: 1, amount_net: 1, cost_asset: 'EUR', cost_amount: 100, timestamp: '2024-01-01T00:00:00Z' });
    // Se vende 1.5 BTC pero solo hay 1 BTC en lotes — shortfall real de 0.5
    await insertTx({ operation_type: 'SELL', asset: 'BTC', amount: 1.5, amount_net: 1.5, cost_asset: 'EUR', cost_amount: 150, timestamp: '2024-02-01T00:00:00Z' });

    const result = await runFifoEngine();

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatch(/Lotes insuficientes para BTC/);
    expect(result.errors[0]).toMatch(/faltan 0\.500000/);

    // Lo que SÍ había disponible (1 BTC) se consume y se cierra el lote igualmente.
    const lots = await db.query(`SELECT quantity_remaining, is_closed FROM fifo_lots WHERE asset = 'BTC'`);
    expect(lots.rows).toHaveLength(1);
    expect(Number(lots.rows[0].quantity_remaining)).toBe(0);
    expect(lots.rows[0].is_closed).toBe(true);
  });

  it('no reporta error cuando hay lotes suficientes (caso normal, sin falsos positivos)', async () => {
    await clearTransactions();
    await insertTx({ operation_type: 'BUY', asset: 'BTC', amount: 1, amount_net: 1, cost_asset: 'EUR', cost_amount: 100, timestamp: '2024-01-01T00:00:00Z' });
    await insertTx({ operation_type: 'SELL', asset: 'BTC', amount: 1, amount_net: 1, cost_asset: 'EUR', cost_amount: 150, timestamp: '2024-02-01T00:00:00Z' });

    const result = await runFifoEngine();

    expect(result.errors).toEqual([]);
  });
});

describe('processSell — fee en tercer activo', () => {
  it('dispone de los lotes del activo de la fee (ej. BNB) en vez de solo restarlo de los proceeds de la venta', async () => {
    await clearTransactions();
    // BNB con coste 400€/unidad (precio de compra), luego usado para pagar una fee.
    await insertTx({ operation_type: 'BUY', asset: 'BNB', amount: 1, amount_net: 1, cost_asset: 'EUR', cost_amount: 400, timestamp: '2024-01-01T00:00:00Z' });
    await insertTx({ operation_type: 'BUY', asset: 'BTC', amount: 1, amount_net: 1, cost_asset: 'EUR', cost_amount: 100, timestamp: '2024-01-02T00:00:00Z' });
    // Vende BTC por 150€, paga la comisión en 0.01 BNB (precio mockeado: 500€/BNB → 5€ de fee)
    await insertTx({
      operation_type: 'SELL', asset: 'BTC', amount: 1, amount_net: 1,
      cost_asset: 'EUR', cost_amount: 150,
      fee_asset: 'BNB', fee_amount: 0.01,
      timestamp: '2024-02-01T00:00:00Z',
    });

    const result = await runFifoEngine();

    expect(result.errors).toEqual([]);

    // La venta de BTC no debe verse reducida por una fee de un activo ajeno:
    // proceeds 150€ - coste 100€ = 50€ de ganancia en el BTC.
    const btcConsumption = await db.query(
      `SELECT gain_loss_eur FROM fifo_lot_consumptions c JOIN fifo_lots l ON l.id = c.lot_id WHERE l.asset = 'BTC'`
    );
    expect(Number(btcConsumption.rows[0].gain_loss_eur)).toBeCloseTo(50, 6);

    // El BNB gastado en la fee debe consumirse de sus propios lotes (disposición
    // patrimonial separada): coste 4€ (0.01 × 400€/u) vs proceeds 5€ (0.01 × 500€ mock) = 1€ ganancia.
    const bnbConsumption = await db.query(
      `SELECT quantity_consumed, cost_basis_consumed_eur, proceeds_eur, gain_loss_eur, fiscal_event_type
       FROM fifo_lot_consumptions c JOIN fifo_lots l ON l.id = c.lot_id WHERE l.asset = 'BNB'`
    );
    expect(bnbConsumption.rows).toHaveLength(1);
    expect(Number(bnbConsumption.rows[0].quantity_consumed)).toBeCloseTo(0.01, 6);
    expect(Number(bnbConsumption.rows[0].cost_basis_consumed_eur)).toBeCloseTo(4, 6);
    expect(Number(bnbConsumption.rows[0].proceeds_eur)).toBeCloseTo(5, 6);
    expect(Number(bnbConsumption.rows[0].gain_loss_eur)).toBeCloseTo(1, 6);
    expect(bnbConsumption.rows[0].fiscal_event_type).toBe('GAIN');

    // El lote de BNB refleja que se gastó 0.01 unidad, no que sigue intacto.
    const bnbLot = await db.query(`SELECT quantity_remaining FROM fifo_lots WHERE asset = 'BNB'`);
    expect(Number(bnbLot.rows[0].quantity_remaining)).toBeCloseTo(0.99, 6);
  });
});

describe('orden de prioridad — TRANSFER_INTERNAL antes que SELL en el mismo instante', () => {
  it('un TRANSFER_INTERNAL y un SELL con el mismo timestamp en la wallet destino no fallan por orden de procesamiento', async () => {
    await clearTransactions();
    const T = '2024-04-01T00:00:00Z';
    // 1 ETH comprado en Spot antes del instante crítico.
    await insertTx({ operation_type: 'BUY', asset: 'ETH', amount: 1, amount_net: 1, cost_asset: 'EUR', cost_amount: 2000, timestamp: '2024-03-31T00:00:00Z' });
    // Al MISMO instante T: se transfiere ese ETH de Spot a Strategy, y se vende en Strategy.
    await insertTx({
      operation_type: 'TRANSFER_INTERNAL', asset: 'ETH', amount: 1, amount_net: 1,
      wallet_id: walletId, destination_wallet_id: strategyWalletId, timestamp: T,
    });
    await insertTx({
      operation_type: 'SELL', asset: 'ETH', amount: 1, amount_net: 1,
      cost_asset: 'EUR', cost_amount: 2500,
      wallet_id: strategyWalletId, timestamp: T,
    });

    const result = await runFifoEngine();

    // Antes del fix, SELL (prioridad 2) se procesaba antes que TRANSFER_INTERNAL
    // (prioridad 3) al mismo timestamp → "sin lotes abiertos" en Strategy.
    expect(result.errors).toEqual([]);

    // Dos consumos esperados: el TRANSFER_INTERNAL mueve el lote (NONE, sin G/P)
    // y el SELL lo consume de verdad en Strategy (GAIN).
    const consumption = await db.query(
      `SELECT gain_loss_eur, fiscal_event_type FROM fifo_lot_consumptions c
       JOIN fifo_lots l ON l.id = c.lot_id WHERE l.asset = 'ETH'
       ORDER BY fiscal_event_type`
    );
    expect(consumption.rows).toHaveLength(2);
    const gain = consumption.rows.find(r => r.fiscal_event_type === 'GAIN');
    expect(gain).toBeDefined();
    expect(Number(gain!.gain_loss_eur)).toBeCloseTo(500, 6); // 2500 - 2000
  });
});

describe('processSell — rama fiat→cripto (comprar cripto pagando con EUR) con fee', () => {
  it('fee en el activo recibido: se descuenta de la cantidad neta del lote', async () => {
    await clearTransactions();
    // Vende 100 EUR por 50 USDC, con 0.5 USDC de fee → llegan netos 49.5 USDC.
    await insertTx({
      operation_type: 'SELL', asset: 'EUR', amount: 100, amount_net: 100,
      cost_asset: 'USDC', cost_amount: 50,
      fee_asset: 'USDC', fee_amount: 0.5,
      timestamp: '2024-07-01T00:00:00Z',
    });

    const result = await runFifoEngine();
    expect(result.errors).toEqual([]);

    const lot = await db.query(`SELECT quantity_original, cost_basis_eur FROM fifo_lots WHERE asset = 'USDC'`);
    expect(lot.rows).toHaveLength(1);
    expect(Number(lot.rows[0].quantity_original)).toBeCloseTo(49.5, 6);
    expect(Number(lot.rows[0].cost_basis_eur)).toBeCloseTo(100, 6);
  });

  it('fee en EUR: se suma al coste base, la cantidad recibida no cambia', async () => {
    await clearTransactions();
    await insertTx({
      operation_type: 'SELL', asset: 'EUR', amount: 100, amount_net: 100,
      cost_asset: 'USDC', cost_amount: 50,
      fee_asset: 'EUR', fee_amount: 1,
      timestamp: '2024-07-01T00:00:00Z',
    });

    const result = await runFifoEngine();
    expect(result.errors).toEqual([]);

    const lot = await db.query(`SELECT quantity_original, cost_basis_eur FROM fifo_lots WHERE asset = 'USDC'`);
    expect(lot.rows).toHaveLength(1);
    expect(Number(lot.rows[0].quantity_original)).toBeCloseTo(50, 6);
    expect(Number(lot.rows[0].cost_basis_eur)).toBeCloseTo(101, 6); // 100 + 1 de fee
  });

  it('fee en un tercer activo (BNB): se dispone por separado, no afecta al lote recibido', async () => {
    await clearTransactions();
    // BNB previo con coste 400€/unidad (mock: precio actual 500€/u).
    await insertTx({ operation_type: 'BUY', asset: 'BNB', amount: 1, amount_net: 1, cost_asset: 'EUR', cost_amount: 400, timestamp: '2024-06-30T00:00:00Z' });
    await insertTx({
      operation_type: 'SELL', asset: 'EUR', amount: 100, amount_net: 100,
      cost_asset: 'USDC', cost_amount: 50,
      fee_asset: 'BNB', fee_amount: 0.01,
      timestamp: '2024-07-01T00:00:00Z',
    });

    const result = await runFifoEngine();
    expect(result.errors).toEqual([]);

    // El lote de USDC no se ve afectado por la fee de BNB.
    const usdcLot = await db.query(`SELECT quantity_original, cost_basis_eur FROM fifo_lots WHERE asset = 'USDC'`);
    expect(Number(usdcLot.rows[0].quantity_original)).toBeCloseTo(50, 6);
    expect(Number(usdcLot.rows[0].cost_basis_eur)).toBeCloseTo(100, 6);

    // El BNB se dispone por separado: coste 4€ (0.01×400) vs proceeds 5€ (0.01×500 mock) = 1€ ganancia.
    const bnbConsumption = await db.query(
      `SELECT quantity_consumed, gain_loss_eur, fiscal_event_type FROM fifo_lot_consumptions c JOIN fifo_lots l ON l.id = c.lot_id WHERE l.asset = 'BNB'`
    );
    expect(bnbConsumption.rows).toHaveLength(1);
    expect(Number(bnbConsumption.rows[0].quantity_consumed)).toBeCloseTo(0.01, 6);
    expect(Number(bnbConsumption.rows[0].gain_loss_eur)).toBeCloseTo(1, 6);
    expect(bnbConsumption.rows[0].fiscal_event_type).toBe('GAIN');
  });
});

describe('emparejamiento MARGIN_BORROW↔SELL — elige el más cercano, no el primero', () => {
  it('con dos SELL del mismo activo en la ventana de 5s, el préstamo se empareja con el más cercano en el tiempo', async () => {
    await clearTransactions();
    // Dos ventas en corto (sin lote previo) del mismo activo: una a t=0s, otra a t=3s.
    // Solo hay UN préstamo (t=4s), cantidad suficiente para UNA de las dos ventas.
    const sellFarId = await insertTx({
      operation_type: 'SELL', asset: 'USTC', amount: 5, amount_net: 5,
      cost_asset: 'EUR', cost_amount: 50, timestamp: '2024-05-01T00:00:00.000Z',
    });
    const sellCloseId = await insertTx({
      operation_type: 'SELL', asset: 'USTC', amount: 5, amount_net: 5,
      cost_asset: 'EUR', cost_amount: 55, timestamp: '2024-05-01T00:00:03.000Z',
    });
    await insertTx({
      operation_type: 'MARGIN_BORROW', asset: 'USTC', amount: 5, amount_net: 5,
      timestamp: '2024-05-01T00:00:04.000Z',
    });

    const result = await runFifoEngine();

    // El préstamo (diff 1s) debe emparejarse con el SELL más cercano (t=3s), no con
    // el más lejano (t=0s, diff 4s) aunque este último aparezca antes cronológicamente.
    // Como solo hay un préstamo para dos ventas, la que NO se empareja debe fallar
    // por falta de lotes — y debe ser la lejana, no la cercana.
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain(sellFarId);

    const closeConsumption = await db.query(
      `SELECT gain_loss_eur FROM fifo_lot_consumptions WHERE consuming_transaction_id = $1`,
      [sellCloseId]
    );
    expect(closeConsumption.rows).toHaveLength(1);
    // El lote del préstamo abre a precio de mercado (mock: 100€/u × 5 = 500€ coste).
    // Proceeds de la venta cercana: 55€. G/P = 55 - 500 = -445€.
    expect(Number(closeConsumption.rows[0].gain_loss_eur)).toBeCloseTo(-445, 6);
  });
});

describe('getOpenLots — desempate determinista entre lotes con el mismo opened_at', () => {
  it('consume los lotes en el orden real de creación (created_at), no en un orden arbitrario', async () => {
    await clearTransactions();
    const T = '2024-06-01T00:00:00Z';
    // Dos compras del MISMO activo, MISMO timestamp exacto, distinto coste —
    // simula dos fills del mismo segundo. Se insertan en statements separados,
    // así que created_at (clock_timestamp()) difiere en el orden real de inserción.
    const lot1Id = await insertTx({ operation_type: 'BUY', asset: 'BTC', amount: 1, amount_net: 1, cost_asset: 'EUR', cost_amount: 100, timestamp: T });
    const lot2Id = await insertTx({ operation_type: 'BUY', asset: 'BTC', amount: 1, amount_net: 1, cost_asset: 'EUR', cost_amount: 200, timestamp: T });
    // Vende 1.5 BTC — más de lo que hay en un solo lote, así que el orden de
    // consumo entre lot1/lot2 sí importa para el resultado.
    await insertTx({ operation_type: 'SELL', asset: 'BTC', amount: 1.5, amount_net: 1.5, cost_asset: 'EUR', cost_amount: 300, timestamp: '2024-06-02T00:00:00Z' });

    const result = await runFifoEngine();
    expect(result.errors).toEqual([]);

    // Si se consume lot1 (coste 100) entero + medio lot2 (coste 100 de 200) → coste
    // total 200, proceeds 300, ganancia 100€. Si el orden fuera al revés (bug),
    // saldría una ganancia distinta (50€).
    const consumptions = await db.query(
      `SELECT l.open_transaction_id, c.quantity_consumed, c.gain_loss_eur
       FROM fifo_lot_consumptions c JOIN fifo_lots l ON l.id = c.lot_id
       WHERE l.asset = 'BTC' ORDER BY c.quantity_consumed DESC`
    );
    expect(consumptions.rows).toHaveLength(2);
    expect(consumptions.rows[0].open_transaction_id).toBe(lot1Id);
    expect(Number(consumptions.rows[0].quantity_consumed)).toBeCloseTo(1, 6);
    expect(consumptions.rows[1].open_transaction_id).toBe(lot2Id);
    expect(Number(consumptions.rows[1].quantity_consumed)).toBeCloseTo(0.5, 6);

    const totalGain = consumptions.rows.reduce((s, r) => s + Number(r.gain_loss_eur), 0);
    expect(totalGain).toBeCloseTo(100, 6);
  });
});

describe('FIFO_DUST_EPSILON — un lote de polvo (<1e-6) no cuenta como disponible', () => {
  it('un lote de cantidad microscópica (1e-8) se ignora al consumir, no se trata como inventario real', async () => {
    await clearTransactions();
    // Lote de polvo real (ej. residuo de un fee): lo crea una BUY normal, no se
    // inserta a mano — runFifoEngine borra y reconstruye TODOS los lotes desde
    // `transactions` en cada ejecución, así que un lote insertado directamente
    // nunca sobreviviría al recálculo.
    await insertTx({ operation_type: 'BUY', asset: 'BTC', amount: 0.00000001, amount_net: 0.00000001, cost_asset: 'EUR', cost_amount: 0.0003, timestamp: '2024-07-01T00:00:00Z' });
    await insertTx({ operation_type: 'BUY', asset: 'BTC', amount: 1, amount_net: 1, cost_asset: 'EUR', cost_amount: 30000, timestamp: '2024-08-01T00:00:00Z' });

    // Vende exactamente 1 BTC "real" — si el lote de polvo se contase como disponible,
    // esta venta consumiría de los DOS lotes (1.00000001 disponibles) sin shortfall.
    // Si se ignora correctamente, solo hay 1 BTC real disponible → sin shortfall tampoco
    // (1 BTC exactos), así que probamos vendiendo 1.00000001 para forzar la diferencia.
    await insertTx({ operation_type: 'SELL', asset: 'BTC', amount: 1.00000001, amount_net: 1.00000001, cost_asset: 'EUR', cost_amount: 35000, timestamp: '2024-08-02T00:00:00Z' });

    const result = await runFifoEngine();

    // Con el lote de polvo excluido, faltan exactamente los 0.00000001 BTC del lote
    // ignorado — por debajo del umbral de shortfall reportable (1e-4), así que no
    // genera error, pero SÍ demuestra que ese lote no se usó: solo 1 fila de consumo,
    // por la cantidad real (1 BTC), no 1.00000001.
    expect(result.errors).toEqual([]);
    const consumptions = await db.query(
      `SELECT quantity_consumed FROM fifo_lot_consumptions c JOIN fifo_lots l ON l.id = c.lot_id WHERE l.asset = 'BTC'`
    );
    expect(consumptions.rows).toHaveLength(1);
    expect(Number(consumptions.rows[0].quantity_consumed)).toBeCloseTo(1, 6);

    // El lote de polvo sigue intacto — nunca se tocó.
    const dustLot = await db.query(`SELECT quantity_remaining, is_closed FROM fifo_lots WHERE quantity_original = 0.00000001`);
    expect(Number(dustLot.rows[0].quantity_remaining)).toBeCloseTo(0.00000001, 10);
    expect(dustLot.rows[0].is_closed).toBe(false);
  });
});

describe('processBuy — aviso visible al crear un lote sintético en una permuta', () => {
  it('genera un aviso en result.errors cuando no hay lotes previos del activo pagado', async () => {
    await clearTransactions();
    // Compra ADA pagando con SOL, sin ningún BUY/DEPOSIT previo de SOL en esta wallet.
    await insertTx({
      operation_type: 'BUY', asset: 'ADA', amount: 100, amount_net: 100,
      cost_asset: 'SOL', cost_amount: 1, timestamp: '2024-09-01T00:00:00Z',
    });

    const result = await runFifoEngine();

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('Aviso: lote sintético creado para SOL');

    // El lote sintético se crea igualmente (comportamiento existente, no cambia) —
    // el aviso es informativo, no bloqueante.
    const lots = await db.query(`SELECT asset, quantity_remaining FROM fifo_lots WHERE asset IN ('ADA', 'SOL')`);
    expect(lots.rows.find(r => r.asset === 'ADA')).toBeDefined();
  });

  it('no genera aviso cuando sí hay un lote previo del activo pagado (caso normal)', async () => {
    await clearTransactions();
    await insertTx({ operation_type: 'BUY', asset: 'SOL', amount: 1, amount_net: 1, cost_asset: 'EUR', cost_amount: 100, timestamp: '2024-08-31T00:00:00Z' });
    await insertTx({
      operation_type: 'BUY', asset: 'ADA', amount: 100, amount_net: 100,
      cost_asset: 'SOL', cost_amount: 1, timestamp: '2024-09-01T00:00:00Z',
    });

    const result = await runFifoEngine();

    expect(result.errors).toEqual([]);
  });
});

describe('runFifoEngine — concurrencia', () => {
  it('dos ejecuciones simultáneas se serializan (advisory lock) y el resultado final es consistente', async () => {
    await clearTransactions();
    await insertTx({ operation_type: 'BUY', asset: 'XRP', amount: 1000, amount_net: 1000, cost_asset: 'EUR', cost_amount: 300, timestamp: '2024-03-01T00:00:00Z' });

    // Si no estuvieran serializadas, ambas ejecuciones podrían entrelazar su DELETE/INSERT
    // sobre las mismas filas. Con el advisory lock, la segunda espera a que la primera
    // haga COMMIT — ninguna debe fallar, y el estado final debe ser el de una reconstrucción
    // limpia (no lotes duplicados ni corruptos).
    const [r1, r2] = await Promise.all([runFifoEngine(), runFifoEngine()]);

    expect(r1.errors).toEqual([]);
    expect(r2.errors).toEqual([]);

    const lots = await db.query(`SELECT quantity_remaining FROM fifo_lots WHERE asset = 'XRP'`);
    expect(lots.rows).toHaveLength(1);
    expect(Number(lots.rows[0].quantity_remaining)).toBe(1000);
  }, 20000);
});
