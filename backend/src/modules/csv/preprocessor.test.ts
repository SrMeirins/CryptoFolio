import { describe, expect, it } from 'vitest';
import { preprocess } from './preprocessor';
import { RawCsvRow } from './types';

// preprocessor.ts no tenía ningún test propio hasta ahora.

function row(overrides: Partial<RawCsvRow>): RawCsvRow {
  return {
    userId: '1', time: new Date('2024-01-01T00:00:00Z'), account: 'Spot',
    operation: 'Buy Crypto With Fiat', coin: 'BTC', change: 1, remark: '',
    rowHash: Math.random().toString(36),
    ...overrides,
  };
}

describe('preprocess — enlace por remark de operaciones Buy Crypto With Fiat/Card', () => {
  it('unifica el timestamp de la fila EUR (gasto) al de la fila cripto (ingreso) cuando comparten remark', () => {
    const cryptoTime = new Date('2024-01-01T10:05:00Z');
    const eurRow = row({ operation: 'Buy Crypto With Fiat', coin: 'EUR', change: -100, remark: 'order-1', time: new Date('2024-01-01T10:00:00Z') });
    const cryptoRow = row({ operation: 'Buy Crypto With Fiat', coin: 'BTC', change: 0.002, remark: 'order-1', time: cryptoTime });

    const result = preprocess([eurRow, cryptoRow]);

    expect(result).toHaveLength(2);
    for (const r of result) {
      expect(r.time).toEqual(cryptoTime);
    }
  });

  it('no mezcla remarks distintos: cada par se unifica de forma independiente', () => {
    const t1 = new Date('2024-01-01T10:05:00Z');
    const t2 = new Date('2024-01-02T20:00:00Z');
    const rows = [
      row({ coin: 'EUR', change: -100, remark: 'order-1', time: new Date('2024-01-01T10:00:00Z') }),
      row({ coin: 'BTC', change: 0.002, remark: 'order-1', time: t1 }),
      row({ coin: 'EUR', change: -50, remark: 'order-2', time: new Date('2024-01-02T19:55:00Z') }),
      row({ coin: 'ETH', change: 0.03, remark: 'order-2', time: t2 }),
    ];

    const result = preprocess(rows);

    const order1 = result.filter(r => r.remark === 'order-1');
    const order2 = result.filter(r => r.remark === 'order-2');
    expect(order1.every(r => r.time.getTime() === t1.getTime())).toBe(true);
    expect(order2.every(r => r.time.getTime() === t2.getTime())).toBe(true);
  });

  it('fila enlazable sin remark pasa sin modificar (ya comparte timestamp, groupByTimestamp la agrupa sola)', () => {
    const original = row({ operation: 'Buy Crypto With Card', remark: '', time: new Date('2024-03-01T00:00:00Z') });
    const result = preprocess([original]);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(original);
  });

  it('grupo sin ninguna fila positiva (ej. solo gasto, sin contrapartida) se pasa sin modificar', () => {
    const onlyNegative = row({ coin: 'EUR', change: -100, remark: 'order-huerfano' });
    const result = preprocess([onlyNegative]);
    expect(result).toHaveLength(1);
    expect(result[0].time).toEqual(onlyNegative.time);
  });

  it('filas de operaciones no enlazables (ej. Deposit) pasan sin modificar', () => {
    const deposit = row({ operation: 'Deposit', remark: '', time: new Date('2024-05-01T00:00:00Z') });
    const result = preprocess([deposit]);
    expect(result).toEqual([deposit]);
  });

  it('preserva el total de filas de entrada en la salida', () => {
    const rows = [
      row({ operation: 'Deposit' }),
      row({ coin: 'EUR', change: -10, remark: 'a' }),
      row({ coin: 'BTC', change: 0.001, remark: 'a' }),
      row({ operation: 'Withdraw' }),
    ];
    expect(preprocess(rows)).toHaveLength(rows.length);
  });
});
