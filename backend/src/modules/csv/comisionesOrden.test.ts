import { describe, expect, it } from 'vitest';
import { parseBinanceCsv } from './parser';
import { repartirComisiones } from './interpreters/trades';
import type { RawCsvRow } from './types';

// Comisiones de una orden de Binance (#543). Binance escribe la comisión de
// cada fill con la misma hora exacta que el fill; con «pagar con BNB», unos
// fills cobran en BNB y otros en el activo. Datos sintéticos.
const HEADER = 'User ID,Time,Account,Operation,Coin,Change,Remark';
const csv = (rows: string[]) => [HEADER, ...rows].join('\n');
const T = '2024-05-10 10:00:00';

describe('parser: comisiones de las ventas (#543)', () => {
  it('une las comisiones del mismo instante a la venta: la del par en la venta y la de BNB enlazada', async () => {
    const r = await parseBinanceCsv(csv([
      `1,${T},Spot,Transaction Sold,ABC,-6,`,
      `1,${T},Spot,Transaction Sold,ABC,-4,`,
      `1,${T},Spot,Transaction Revenue,USDT,60,`,
      `1,${T},Spot,Transaction Revenue,USDT,40,`,
      `1,${T},Spot,Transaction Fee,BNB,-0.01,`,
      `1,${T},Spot,Transaction Fee,USDT,-0.1,`,
    ]));
    expect(r.errors).toEqual([]);
    const venta = r.transactions.find(t => t.operationType === 'SELL')!;
    expect(venta).toMatchObject({ asset: 'ABC', amount: 10, costAsset: 'USDT', costAmount: 100, feeAsset: 'USDT' });
    expect(venta.feeAmount).toBeCloseTo(0.1, 12);
    const fees = r.transactions.filter(t => t.operationType === 'FEE_EXCHANGE');
    expect(fees).toHaveLength(1);
    expect(fees[0]).toMatchObject({ asset: 'BNB', amount: 0.01, comisionDe: venta.rawRowHashes[0], notes: 'Fee en BNB para SELL ABC' });
    // Cada fila en bruto pertenece a una sola transacción.
    expect(venta.rawRowHashes.filter(h => fees[0].rawRowHashes.includes(h))).toEqual([]);
    expect(venta.rawRowHashes).toHaveLength(5);
  });

  it('si solo hay comisión en BNB, va en la propia venta', async () => {
    const r = await parseBinanceCsv(csv([
      `1,${T},Spot,Transaction Sold,ABC,-10,`,
      `1,${T},Spot,Transaction Revenue,USDT,100,`,
      `1,${T},Spot,Transaction Fee,BNB,-0.01,`,
    ]));
    expect(r.transactions).toHaveLength(1);
    expect(r.transactions[0]).toMatchObject({ operationType: 'SELL', feeAsset: 'BNB', feeAmount: 0.01 });
  });

  it('no une por cercanía: una comisión un segundo después queda suelta', async () => {
    const r = await parseBinanceCsv(csv([
      `1,${T},Spot,Transaction Sold,ABC,-10,`,
      `1,${T},Spot,Transaction Revenue,USDT,100,`,
      `1,2024-05-10 10:00:01,Spot,Transaction Fee,USDT,-0.1,`,
    ]));
    expect(r.transactions.find(t => t.operationType === 'SELL')!.feeAsset).toBeUndefined();
    expect(r.transactions.filter(t => t.operationType === 'FEE_EXCHANGE')).toHaveLength(1);
  });

  it('no une entre cuentas distintas en el mismo instante', async () => {
    const r = await parseBinanceCsv(csv([
      `1,${T},Spot,Transaction Sold,ABC,-10,`,
      `1,${T},Spot,Transaction Revenue,USDT,100,`,
      `1,${T},Cross Margin,Transaction Fee,USDT,-0.1,`,
    ]));
    expect(r.transactions.find(t => t.operationType === 'SELL')!.feeAsset).toBeUndefined();
    expect(r.transactions.filter(t => t.operationType === 'FEE_EXCHANGE')).toHaveLength(1);
  });

  it('instante ambiguo (compra y venta a la vez): la comisión se queda con la compra, como antes', async () => {
    const r = await parseBinanceCsv(csv([
      `1,${T},Spot,Transaction Sold,ABC,-10,`,
      `1,${T},Spot,Transaction Revenue,USDT,100,`,
      `1,${T},Spot,Transaction Buy,XYZ,5,`,
      `1,${T},Spot,Transaction Spend,USDT,-50,`,
      `1,${T},Spot,Transaction Fee,XYZ,-0.05,`,
    ]));
    expect(r.errors).toEqual([]);
    expect(r.transactions.find(t => t.operationType === 'SELL')!.feeAsset).toBeUndefined();
    expect(r.transactions.find(t => t.operationType === 'BUY')).toMatchObject({ asset: 'XYZ', feeAsset: 'XYZ', feeAmount: 0.05 });
  });
});

describe('parser: comisiones de las compras (#543)', () => {
  it('comisión en el activo y en BNB: la del activo en la compra y la de BNB enlazada', async () => {
    const r = await parseBinanceCsv(csv([
      `1,${T},Spot,Transaction Buy,XYZ,6,`,
      `1,${T},Spot,Transaction Buy,XYZ,4,`,
      `1,${T},Spot,Transaction Spend,USDT,-60,`,
      `1,${T},Spot,Transaction Spend,USDT,-40,`,
      `1,${T},Spot,Transaction Fee,XYZ,-0.01,`,
      `1,${T},Spot,Transaction Fee,BNB,-0.002,`,
    ]));
    expect(r.errors).toEqual([]);
    const compra = r.transactions.find(t => t.operationType === 'BUY')!;
    expect(compra).toMatchObject({ asset: 'XYZ', amount: 10, feeAsset: 'XYZ', feeAmount: 0.01 });
    expect(compra.amountNet).toBeCloseTo(9.99, 12);
    const fee = r.transactions.find(t => t.operationType === 'FEE_EXCHANGE')!;
    expect(fee).toMatchObject({ asset: 'BNB', amount: 0.002, comisionDe: compra.rawRowHashes[0], notes: 'Fee en BNB para BUY XYZ' });
  });

  it('comisión en lo pagado y en BNB: ya no se suman monedas distintas en una sola', async () => {
    const r = await parseBinanceCsv(csv([
      `1,${T},Spot,Transaction Buy,XYZ,10,`,
      `1,${T},Spot,Transaction Spend,USDT,-100,`,
      `1,${T},Spot,Transaction Fee,USDT,-0.1,`,
      `1,${T},Spot,Transaction Fee,BNB,-0.002,`,
    ]));
    const compra = r.transactions.find(t => t.operationType === 'BUY')!;
    expect(compra).toMatchObject({ feeAsset: 'USDT', feeAmount: 0.1, amountNet: 10 });
    expect(r.transactions.find(t => t.operationType === 'FEE_EXCHANGE')).toMatchObject({ asset: 'BNB', amount: 0.002 });
  });
});

describe('repartirComisiones (#543)', () => {
  const fila = (coin: string, change: number): RawCsvRow =>
    ({ coin, change, operation: 'Transaction Fee', rowHash: `${coin}${change}` } as RawCsvRow);

  it('prefiere una moneda del par, en el orden indicado, y agrupa el resto por moneda', () => {
    const r = repartirComisiones([fila('BNB', -1), fila('USDT', -2), fila('BNB', -3)], ['USDT', 'ABC']);
    expect(r.feeAsset).toBe('USDT');
    expect(r.feeAmount).toBe(2);
    expect(r.otras.map(o => [o.coin, o.amount, o.rows.length])).toEqual([['BNB', 4, 2]]);
  });

  it('sin comisiones no devuelve nada', () => {
    expect(repartirComisiones([], ['USDT'])).toEqual({ otras: [] });
  });
});
