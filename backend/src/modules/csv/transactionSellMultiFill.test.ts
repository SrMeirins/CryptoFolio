import { describe, expect, it } from 'vitest';
import { parseBinanceCsv } from './parser';

const HEADER = 'User ID,Time,Account,Operation,Coin,Change,Remark';

function csv(rows: string[]): string {
  return [HEADER, ...rows].join('\n');
}

describe('parseBinanceCsv — Transaction Sell con múltiples fills', () => {
  // NOTA: "Transaction Sell" no está en la whitelist de operaciones conocidas
  // (ALL_BINANCE_OPERATIONS) — el validador real bloquearía un CSV con esta
  // etiqueta antes de llegar aquí. Este test ejercita directamente
  // parseBinanceCsv() (que no valida, solo interpreta) para blindar la lógica
  // de suma por si esta operación se activa en el futuro. La forma del grupo
  // (misma etiqueta para la pata vendida y la recibida) es la única
  // consistente con cómo interpretTransactionSell busca receiveRow — no hay
  // ningún ejemplo real de Binance para confirmarla.
  //
  // La fee NO se incluye en estas aserciones: por cómo agrupa mainOpType()
  // (ya documentado en shortSale.test.ts), una fila "Transaction Fee" nunca
  // co-agrupa con "Transaction Sell" — sale siempre como FEE_EXCHANGE
  // independiente, una transacción por fila, nunca sumada ni embebida en el
  // SELL. El hallazgo de la auditoría original asumía que la fee sí se
  // embebía; verificado contra el código real, no es así.
  it('suma todos los fills de venta y de contrapartida recibida, no solo el primero', async () => {
    // Binance divide una venta grande en 3 fills al mismo segundo — cada uno
    // con su propia fila de venta y de contrapartida recibida.
    const rows = [
      '123,2024-05-10 10:00:00,Spot,Transaction Sell,BTC,-0.5,',
      '123,2024-05-10 10:00:00,Spot,Transaction Sell,BTC,-0.3,',
      '123,2024-05-10 10:00:00,Spot,Transaction Sell,BTC,-0.2,',
      '123,2024-05-10 10:00:00,Spot,Transaction Sell,USDT,20000,',
      '123,2024-05-10 10:00:00,Spot,Transaction Sell,USDT,12000,',
      '123,2024-05-10 10:00:00,Spot,Transaction Sell,USDT,8000,',
    ];

    const result = await parseBinanceCsv(csv(rows));
    expect(result.errors).toEqual([]);

    const sell = result.transactions.find(t => t.operationType === 'SELL');
    expect(sell).toBeDefined();
    expect(sell!.asset).toBe('BTC');
    expect(sell!.amount).toBeCloseTo(1.0, 8); // 0.5 + 0.3 + 0.2, no solo 0.5
    expect(sell!.costAsset).toBe('USDT');
    expect(sell!.costAmount).toBeCloseTo(40000, 8); // 20000+12000+8000, no solo 20000
  });

  it('la fee, aunque presente en el mismo timestamp, sale como FEE_EXCHANGE independiente por cada fila (no se embebe ni se suma en el SELL)', async () => {
    const rows = [
      '123,2024-05-10 10:00:00,Spot,Transaction Sell,BTC,-0.5,',
      '123,2024-05-10 10:00:00,Spot,Transaction Sell,BTC,-0.3,',
      '123,2024-05-10 10:00:00,Spot,Transaction Sell,USDT,20000,',
      '123,2024-05-10 10:00:00,Spot,Transaction Sell,USDT,12000,',
      '123,2024-05-10 10:00:00,Spot,Transaction Fee,USDT,-20,',
      '123,2024-05-10 10:00:00,Spot,Transaction Fee,USDT,-12,',
    ];

    const result = await parseBinanceCsv(csv(rows));
    expect(result.errors).toEqual([]);

    const sell = result.transactions.find(t => t.operationType === 'SELL');
    expect(sell!.amount).toBeCloseTo(0.8, 8);
    expect(sell!.costAmount).toBeCloseTo(32000, 8);

    const fees = result.transactions.filter(t => t.operationType === 'FEE_EXCHANGE');
    expect(fees.length).toBe(2);
    expect(fees.reduce((s, f) => s + f.amount, 0)).toBeCloseTo(32, 8);
  });

  it('un único fill (caso normal) sigue funcionando igual que antes', async () => {
    const rows = [
      '123,2024-05-10 10:00:00,Spot,Transaction Sell,BTC,-0.5,',
      '123,2024-05-10 10:00:00,Spot,Transaction Sell,USDT,20000,',
    ];

    const result = await parseBinanceCsv(csv(rows));
    expect(result.errors).toEqual([]);

    const sell = result.transactions.find(t => t.operationType === 'SELL');
    expect(sell!.amount).toBeCloseTo(0.5, 8);
    expect(sell!.costAmount).toBeCloseTo(20000, 8);
  });
});
