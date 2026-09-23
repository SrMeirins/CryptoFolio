import { describe, expect, it } from 'vitest';
import { parseBinanceCsv } from './parser';

const HEADER = 'User ID,Time,Account,Operation,Coin,Change,Remark';

function csv(rows: string[]): string {
  return [HEADER, ...rows].join('\n');
}

describe('parseBinanceCsv — venta en corto de margin (Margin Loan + Transaction Sold)', () => {
  it('short puro (vendido = prestado): el préstamo se registra como MARGIN_BORROW y la venta como SELL, no se descarta nada', () => {
    // Réplica mínima del caso real (23-dic-2023, USTC): pides prestados 100 USTC,
    // los vendes enteros, recibes USDT.
    const rows = [
      '123,2023-12-23 06:26:48,Cross Margin,Transaction Sold,USTC,-60,',
      '123,2023-12-23 06:26:48,Cross Margin,Transaction Sold,USTC,-40,',
      '123,2023-12-23 06:26:48,Cross Margin,Transaction Revenue,USDT,3.00,',
      '123,2023-12-23 06:26:48,Cross Margin,Transaction Revenue,USDT,2.00,',
      '123,2023-12-23 06:26:48,Cross Margin,Transaction Fee,USDT,-0.01,',
      '123,2023-12-23 06:26:48,Cross Margin,Margin Loan,USTC,100,',
    ];

    const result = parseBinanceCsv(csv(rows));

    expect(result.errors).toEqual([]);

    const borrow = result.transactions.find(t => t.operationType === 'MARGIN_BORROW');
    const sell = result.transactions.find(t => t.operationType === 'SELL');

    // El préstamo debe registrarse — antes se descartaba por completo.
    expect(borrow).toBeDefined();
    expect(borrow!.asset).toBe('USTC');
    expect(borrow!.amount).toBe(100);

    // La venta debe registrarse como SELL normal — antes también se descartaba.
    expect(sell).toBeDefined();
    expect(sell!.asset).toBe('USTC');
    expect(sell!.amount).toBe(100);
    expect(sell!.costAsset).toBe('USDT');
    // "Transaction Fee" siempre agrupa bajo el mainOpType de compra (mainOpType()),
    // así que para una venta sale como FEE_EXCHANGE aparte, no embebido en el SELL
    // — comportamiento real verificado contra el CSV de producción.
    expect(sell!.costAmount).toBeCloseTo(5.00, 6);
    const fee = result.transactions.find(t => t.operationType === 'FEE_EXCHANGE');
    expect(fee).toBeDefined();
    expect(fee!.amount).toBeCloseTo(0.01, 6);

    // Nada se clasifica como IGNORED/descartado para este grupo.
    expect(result.transactions.some(t => t.operationType === 'IGNORED')).toBe(false);
  });

  it('short mixto (vendido > prestado): sigue funcionando igual que antes (caso ya soportado)', () => {
    const rows = [
      '123,2023-12-23 06:26:48,Cross Margin,Transaction Sold,USTC,-150,',
      '123,2023-12-23 06:26:48,Cross Margin,Transaction Revenue,USDT,7.50,',
      '123,2023-12-23 06:26:48,Cross Margin,Margin Loan,USTC,100,',
    ];

    const result = parseBinanceCsv(csv(rows));

    expect(result.errors).toEqual([]);
    const borrow = result.transactions.find(t => t.operationType === 'MARGIN_BORROW');
    const sell = result.transactions.find(t => t.operationType === 'SELL');
    expect(borrow!.amount).toBe(100);
    expect(sell!.amount).toBe(150); // se vende todo: 100 prestado + 50 propio
  });
});
