import { describe, expect, it } from 'vitest';
import { originalRow, originalRowsByHash, originalRowsTable } from './originalRows';

// Filas originales del CSV (#374). Datos sintéticos.
describe('originalRow y originalRowsByHash (#374)', () => {
  it('descarta el User ID y conserva el resto tal cual', () => {
    expect(originalRow({ 'User ID': '999', Time: 't', Remark: '<i>x</i>' })).toEqual({ Time: 't', Remark: '<i>x</i>' });
  });

  it('una fila por hash', () => {
    const map = originalRowsByHash([{ hash: 'a', record: { 'User ID': '1', Coin: 'XRP' } }, { hash: 'b', record: { Coin: 'BTC' } }]);
    expect([...map]).toEqual([['a', { Coin: 'XRP' }], ['b', { Coin: 'BTC' }]]);
  });
});

describe('originalRowsTable (#374)', () => {
  it('columnas en el orden del CSV del exchange, las desconocidas al final y nunca las privadas', () => {
    const t = originalRowsTable('binance', [{ Remark: '', Coin: 'XRP', Time: 't', Extra: '1', 'User ID': '9' }]);
    expect(t.columns).toEqual(['Time', 'Coin', 'Remark', 'Extra']);
    expect(t.rows).toEqual([['t', 'XRP', '', '1']]);
  });

  it('Bitvavo en su orden; filas ordenadas de forma estable', () => {
    const t = originalRowsTable('bitvavo', [
      { 'Transaction ID': 'b', Date: '2024-01-02', Type: 'buy' },
      { 'Transaction ID': 'a', Date: '2024-01-01', Type: 'buy' },
    ]);
    expect(t.columns).toEqual(['Date', 'Type', 'Transaction ID']);
    expect(t.rows.map(r => r[2])).toEqual(['a', 'b']);
  });

  it('ordena los importes de forma natural, no como texto', () => {
    const t = originalRowsTable('binance', [{ Time: 't', Change: '1156866.54' }, { Time: 't', Change: '120000' }, { Time: 't', Change: '9' }]);
    expect(t.rows.map(r => r[1])).toEqual(['9', '120000', '1156866.54']);
  });

  it('exchange desconocido: columnas por orden alfabético; valores ausentes como texto vacío', () => {
    const t = originalRowsTable(null, [{ b: '1' }, { a: '2' }]);
    expect(t).toEqual({ columns: ['a', 'b'], rows: [['', '1'], ['2', '']] });
  });
});
