import { describe, expect, it } from 'vitest';
import { parseBinanceCsv } from './parser';

// Prueba de extremo a extremo de parseBinanceCsv con un CSV sintético que
// mezcla los casos más habituales de un export real de Binance: compra con
// comisión, retirada a wallet externa y una operación ignorada. Los casos
// especiales (margin, multi-activo, colisiones de hash…) tienen sus propios
// ficheros de test en este directorio.

const HEADER = 'User ID,Time,Account,Operation,Coin,Change,Remark';

function csv(rows: string[]): string {
  return [HEADER, ...rows].join('\n');
}

const ROWS = [
  // Compra de 100 XRP pagando 50 USDC, con comisión en XRP
  '123,2024-03-01 10:00:00,Spot,Transaction Buy,XRP,100,',
  '123,2024-03-01 10:00:00,Spot,Transaction Spend,USDC,-50,',
  '123,2024-03-01 10:00:00,Spot,Transaction Fee,XRP,-0.1,',
  // Retirada de XRP fuera del exchange
  '123,2024-03-02 12:30:00,Spot,Withdraw,XRP,-40,',
  // Operación sin efecto fiscal que el parser descarta
  '123,2024-03-03 08:00:00,Spot,Token Swap - Redenomination/Rebranding,XRP,0,',
];

describe('parseBinanceCsv — CSV sintético de extremo a extremo', () => {
  it('procesa compra y retirada sin errores y cuadra las estadísticas', async () => {
    const result = await parseBinanceCsv(csv(ROWS));

    expect(result.errors).toEqual([]);
    expect(result.stats.totalRows).toBe(ROWS.length);
    expect(result.stats.errorRows).toBe(0);
    expect(result.stats.ignoredRows).toBe(1);
    expect(result.stats.transactionCount).toBe(result.transactions.length);
  });

  it('registra la compra con su coste en USDC', async () => {
    const result = await parseBinanceCsv(csv(ROWS));

    const buys = result.transactions.filter(t => t.operationType === 'BUY' && t.asset === 'XRP');
    expect(buys).toHaveLength(1);
    expect(buys[0].costAsset).toBe('USDC');
    expect(buys[0].costAmount).toBeCloseTo(50, 6);
  });

  it('registra la retirada con su fecha en UTC', async () => {
    const result = await parseBinanceCsv(csv(ROWS));

    const withdraws = result.transactions.filter(t => t.operationType === 'WITHDRAW');
    expect(withdraws).toHaveLength(1);
    expect(withdraws[0].asset).toBe('XRP');
    expect(withdraws[0].amount).toBeCloseTo(40, 6);
    expect(withdraws[0].timestamp.toISOString()).toBe('2024-03-02T12:30:00.000Z');
  });

  it('un CSV vacío (solo cabecera) no produce transacciones ni errores', async () => {
    const result = await parseBinanceCsv(csv([]));

    expect(result.errors).toEqual([]);
    expect(result.transactions).toEqual([]);
  });
});
