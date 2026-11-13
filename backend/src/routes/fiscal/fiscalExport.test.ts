import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import ExcelJS from 'exceljs';
import { Pool } from 'pg';
import { createTestDatabase, TestDatabase } from '../../test/setup-test-db';

// Exportaciones del ejercicio (#547): Excel con sus hojas, fechas reales,
// filtros y totales iguales a la pantalla; PDF con las secciones elegidas;
// CSV en una tabla con formato castellano; validación del formato y las
// secciones. La inyección de fórmulas en CSV está en fiscalCsvInjection.test.ts.
const binario = (response: NodeJS.ReadableStream, callback: (e: Error | null, b: Buffer) => void) => {
  const chunks: Buffer[] = [];
  response.on('data', (chunk: Buffer) => chunks.push(chunk));
  response.on('end', () => callback(null, Buffer.concat(chunks)));
};
let testDb: TestDatabase;
let pool: Pool;
let app: import('express').Express;
let walletId: string;

describe('GET /api/fiscal/:year/export — excel y pdf', () => {
  beforeAll(async () => {
    testDb = await createTestDatabase();
    process.env.DATABASE_URL = testDb.connectionString;
    pool = new Pool({ connectionString: testDb.connectionString });

    const wallet = await pool.query(`INSERT INTO wallets (name, type) VALUES ('Wallet export test', 'hardware') RETURNING id`);
    walletId = wallet.rows[0].id;

    const buyTx = await pool.query(
      `INSERT INTO transactions (operation_type, timestamp, asset, amount, amount_net, wallet_id)
       VALUES ('BUY', '2023-01-01T00:00:00Z', 'BTC', 1, 1, $1) RETURNING id`,
      [walletId]
    );
    const lot = await pool.query(
      `INSERT INTO fifo_lots (asset, quantity_original, quantity_remaining, cost_basis_eur, price_per_unit_eur, open_transaction_id, opened_at, wallet_id, is_closed)
       VALUES ('BTC', 1, 1, 0, 0, $1, '2023-01-01T00:00:00Z', $2, FALSE) RETURNING id`,
      [buyTx.rows[0].id, walletId]
    );
    const sellTx = await pool.query(
      `INSERT INTO transactions (operation_type, timestamp, asset, amount, amount_net, wallet_id)
       VALUES ('SELL', '2023-06-01T00:00:00Z', 'BTC', 1, 1, $1) RETURNING id`,
      [walletId]
    );
    await pool.query(
      `INSERT INTO fifo_lot_consumptions (lot_id, consuming_transaction_id, quantity_consumed, cost_basis_consumed_eur, proceeds_eur, gain_loss_eur, fiscal_event_type, consumed_at)
       VALUES ($1, $2, 1, 0, 50, 50, 'GAIN', '2023-06-01T00:00:00Z')`,
      [lot.rows[0].id, sellTx.rows[0].id]
    );
    await pool.query(`UPDATE fifo_lots SET quantity_remaining = 0, is_closed = TRUE WHERE id = $1`, [lot.rows[0].id]);

    app = (await import('../../app')).default;
  });

  afterAll(async () => {
    await pool.end();
    if (testDb) await testDb.teardown();
  });

  it('format=excel devuelve un .xlsx no vacío con el content-type correcto', async () => {
    // exceljs escribe al stream de respuesta sin Content-Length (chunked) —
    // se bufferiza el binario igual que en el test de pdf.
    const res = await request(app).get('/api/fiscal/2023/export?format=excel').buffer().parse(binario);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('spreadsheetml');
    expect(res.headers['content-disposition']).toContain('fiscal_2023.xlsx');
    expect((res.body as Buffer).length).toBeGreaterThan(0);

    // El fichero se puede leer y contiene las hojas y la fila esperadas (#204, #547).
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(res.body as Buffer);
    expect(wb.worksheets.map(w => w.name)).toEqual(['Resumen', 'Compensación', 'Por activo', 'Operaciones', 'Rendimientos', 'Lotes FIFO']);
    const ops = wb.getWorksheet('Operaciones')!;
    expect(ops.getRow(1).getCell(1).value).toBe('Fecha');
    // Fecha real (no texto), con formato DD/MM/AAAA.
    expect(ops.getRow(2).getCell(1).value).toBeInstanceOf(Date);
    expect(ops.getColumn(1).numFmt).toBe('dd/mm/yyyy');
    expect(ops.getRow(2).getCell(3).value).toBe('BTC');
    expect(ops.getRow(2).getCell(14).value).toBe(50);
    expect(ops.autoFilter).toBeTruthy();
    // El neto del Resumen coincide con el de la pantalla.
    const summary = (await request(app).get('/api/fiscal/2023/summary')).body;
    const resumen = wb.getWorksheet('Resumen')!;
    const neto = resumen.getRows(2, resumen.rowCount - 1)!.find(r => r.getCell(1).value === 'Neto de ganancias y pérdidas')!;
    expect(neto.getCell(2).value).toBeCloseTo(summary.netoPatrimonial, 2);
  });

  it('las secciones elegidas deciden las hojas del Excel; una sección desconocida es un 400', async () => {
    const res = await request(app).get('/api/fiscal/2023/export?format=excel&secciones=operaciones,resumen').buffer().parse(binario);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(res.body as Buffer);
    expect(wb.worksheets.map(w => w.name)).toEqual(['Resumen', 'Operaciones']);
    expect((await request(app).get('/api/fiscal/2023/export?format=excel&secciones=otra')).status).toBe(400);
  });

  it('el CSV general es una tabla con punto y coma, coma decimal y fechas DD/MM/AAAA', async () => {
    const res = await request(app).get('/api/fiscal/2023/export?format=csv');
    expect(res.status).toBe(200);
    expect(res.headers['content-disposition']).toContain('fiscal_2023.csv');
    const lineas = res.text.replace(/^\uFEFF/, '').split('\r\n');
    expect(lineas[0]).toBe('Fecha;Tipo;Base;Activo;Cantidad;Wallet;Canal;Clave contraprestación;Descripción contraprestación;Valor transmisión EUR;Gastos transmisión EUR;Valor adquisición EUR;Gastos adquisición EUR;Resultado EUR');
    expect(lineas[1]).toMatch(/^01\/06\/2023;[^;]*;Ahorro;BTC;1;Wallet export test;/);
    expect(lineas[1].endsWith(';50,00')).toBe(true);
  });

  it('exceljs genera identificadores con uuid (versión forzada por overrides, #204)', async () => {
    // Única ruta de exceljs que usa uuid: el formato condicional con conjuntos de iconos.
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Prueba');
    ws.addRow([1]); ws.addRow([2]);
    ws.addConditionalFormatting({
      ref: 'A1:A2',
      rules: [{
        type: 'iconSet', iconSet: '3Triangles', priority: 1,
        cfvo: [{ type: 'percent', value: 0 }, { type: 'percent', value: 33 }, { type: 'percent', value: 67 }],
      }],
    });
    const buffer = Buffer.from(await wb.xlsx.writeBuffer());
    const reloaded = new ExcelJS.Workbook();
    await reloaded.xlsx.load(buffer);
    expect(reloaded.getWorksheet('Prueba')?.getRow(2).getCell(1).value).toBe(2);
  });

  it('format=pdf devuelve un PDF no vacío con el content-type correcto', async () => {
    const res = await request(app).get('/api/fiscal/2023/export?format=pdf&secciones=resumen,operaciones').buffer().parse(binario);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/pdf');
    expect(res.headers['content-disposition']).toContain('fiscal_2023.pdf');
    expect((res.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('las preferencias de exportación solo admiten un formato y secciones válidos', async () => {
    const put = (value: string) => request(app).put('/api/settings/config').send({ key: 'export_preferencias', value });
    expect((await put(JSON.stringify({ formato: 'excel', secciones: ['resumen', 'lotes'] }))).status).toBe(200);
    expect((await put(JSON.stringify({ formato: 'xml', secciones: ['resumen'] }))).status).toBe(400);
    expect((await put(JSON.stringify({ formato: 'pdf', secciones: [] }))).status).toBe(400);
    expect((await put('no es json')).status).toBe(400);
    await pool.query(`DELETE FROM app_config WHERE key = 'export_preferencias'`);
  });

  it('format desconocido devuelve 400', async () => {
    const res = await request(app).get('/api/fiscal/2023/export?format=xml');
    expect(res.status).toBe(400);
  });
});
