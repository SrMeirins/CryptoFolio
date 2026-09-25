import { describe, expect, it, vi } from 'vitest';

// interpretMultiAssetBuy reparte el coste por VALOR real (cantidad × precio
// histórico), no por cantidad bruta — hay que mockear el precio histórico
// para no depender de una llamada real a CoinGecko en el test.
vi.mock('../prices/binance', () => ({
  getHistoricalPriceEur: vi.fn(async (asset: string) => {
    if (asset === 'BTC') return 50000;
    if (asset === 'XRP') return 0.5;
    throw new Error(`precio no mockeado para ${asset}`);
  }),
}));

import { parseBinanceCsv } from './parser';

const HEADER = 'User ID,Time,Account,Operation,Coin,Change,Remark';

function csv(rows: string[]): string {
  return [HEADER, ...rows].join('\n');
}

describe('parseBinanceCsv — Transaction Buy multi-activo: reparto por valor real', () => {
  it('reparte el coste proporcionalmente al VALOR (cantidad × precio), no a la cantidad bruta', async () => {
    // 0.01 BTC (500€ a 50000€/BTC) + 1000 XRP (500€ a 0.5€/XRP) — mismo
    // valor económico (50/50), pese a que las cantidades brutas (0.01 vs
    // 1000) no tienen nada que ver entre sí.
    const rows = [
      '123,2024-05-10 10:00:00,Spot,Transaction Buy,BTC,0.01,',
      '123,2024-05-10 10:00:00,Spot,Transaction Buy,XRP,1000,',
      '123,2024-05-10 10:00:00,Spot,Transaction Spend,USDC,-2000,',
    ];

    const result = await parseBinanceCsv(csv(rows));
    expect(result.errors).toEqual([]);

    const buys = result.transactions.filter(t => t.operationType === 'BUY');
    expect(buys.length).toBe(2);

    const btcBuy = buys.find(t => t.asset === 'BTC')!;
    const xrpBuy = buys.find(t => t.asset === 'XRP')!;

    // Reparto correcto: 50/50 por valor, no ~0%/~100% por cantidad bruta.
    expect(btcBuy.costAmount).toBeCloseTo(1000, 6);
    expect(xrpBuy.costAmount).toBeCloseTo(1000, 6);
  });

  it('reparte proporcionalmente cuando el valor NO es 50/50', async () => {
    // 0.02 BTC (1000€) + 1000 XRP (500€) → BTC debe llevarse 2/3 del coste.
    const rows = [
      '123,2024-05-10 10:00:00,Spot,Transaction Buy,BTC,0.02,',
      '123,2024-05-10 10:00:00,Spot,Transaction Buy,XRP,1000,',
      '123,2024-05-10 10:00:00,Spot,Transaction Spend,USDC,-1500,',
    ];

    const result = await parseBinanceCsv(csv(rows));
    const buys = result.transactions.filter(t => t.operationType === 'BUY');
    const btcBuy = buys.find(t => t.asset === 'BTC')!;
    const xrpBuy = buys.find(t => t.asset === 'XRP')!;

    expect(btcBuy.costAmount).toBeCloseTo(1000, 6); // 2/3 de 1500
    expect(xrpBuy.costAmount).toBeCloseTo(500, 6);  // 1/3 de 1500
  });
});
