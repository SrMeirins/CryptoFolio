import { describe, expect, it } from 'vitest';
import { parseBinanceCsv } from './parser';

// Hallazgo de auditoría: "Media — Fees potencialmente perdidas en Convert/
// Small Assets/ETH2.0". interpretConvert, interpretSmallAssetsExchange e
// interpretEth2Staking asumen exactamente 1 fila positiva y 1 negativa por
// grupo, sin capturar feeAsset/feeAmount. Sin datos reales que hoy incluyan
// una 3ª fila, se decide fallar explícito (forzar revisión manual) en vez de
// perder o malinterpretar la fila extra en silencio.

const HEADER = 'User ID,Time,Account,Operation,Coin,Change,Remark';

function csv(rows: string[]): string {
  return [HEADER, ...rows].join('\n');
}

describe('parseBinanceCsv — falla explícito ante grupos de >2 filas (posible fee no capturado)', () => {
  it('Binance Convert con 3 filas en el mismo grupo: error explícito, no se inventa una transacción', async () => {
    const rows = [
      '123,2024-01-01 10:00:00,Spot,Binance Convert,USDT,-100,',
      '123,2024-01-01 10:00:00,Spot,Binance Convert,BTC,0.002,',
      // 3ª fila hipotética de fee — Binance no la manda hoy, pero si algún
      // día lo hace, el parser debe fallar en vez de perderla en silencio.
      '123,2024-01-01 10:00:00,Spot,Binance Convert,BNB,-0.001,',
    ];

    const result = await parseBinanceCsv(csv(rows));

    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0].message).toMatch(/Binance Convert.*3 filas|inesperado/i);
    // No debe haberse generado ninguna transacción a partir de este grupo.
    expect(result.transactions.find(t => t.notes?.includes('Binance Convert'))).toBeUndefined();
  });

  it('Binance Convert con 2 filas (caso normal): se procesa sin error', async () => {
    const rows = [
      '123,2024-01-01 10:00:00,Spot,Binance Convert,USDT,-100,',
      '123,2024-01-01 10:00:00,Spot,Binance Convert,BTC,0.002,',
    ];

    const result = await parseBinanceCsv(csv(rows));

    expect(result.errors).toEqual([]);
    expect(result.transactions).toHaveLength(1);
    expect(result.transactions[0].operationType).toBe('BUY');
  });

  it('Small Assets Exchange con 3 filas para el mismo remark: error explícito', async () => {
    const rows = [
      '123,2024-01-01 10:00:00,Spot,Small Assets Exchange BNB,USDC,-10,USDC to BNB',
      '123,2024-01-01 10:00:00,Spot,Small Assets Exchange BNB,BNB,0.02,USDC to BNB',
      '123,2024-01-01 10:00:00,Spot,Small Assets Exchange BNB,BNB,-0.0001,USDC to BNB',
    ];

    const result = await parseBinanceCsv(csv(rows));

    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0].message).toMatch(/Small Assets Exchange.*3 filas|inesperado/i);
  });

  it('Small Assets Exchange con remarks distintos de 2 filas cada uno: se procesa sin error (caso normal, multi-activo)', async () => {
    const rows = [
      '123,2024-01-01 10:00:00,Spot,Small Assets Exchange BNB,USDC,-10,USDC to BNB',
      '123,2024-01-01 10:00:00,Spot,Small Assets Exchange BNB,BNB,0.02,USDC to BNB',
      '123,2024-01-01 10:00:00,Spot,Small Assets Exchange BNB,EUR,-5,EUR to BNB',
      '123,2024-01-01 10:00:00,Spot,Small Assets Exchange BNB,BNB,0.01,EUR to BNB',
    ];

    const result = await parseBinanceCsv(csv(rows));

    expect(result.errors).toEqual([]);
    expect(result.transactions).toHaveLength(2);
  });

  it('ETH 2.0 Staking con 3 filas: error explícito', async () => {
    const rows = [
      '123,2024-01-01 10:00:00,Spot,ETH 2.0 Staking,ETH,-1,',
      '123,2024-01-01 10:00:00,Spot,ETH 2.0 Staking,BETH,1,',
      '123,2024-01-01 10:00:00,Spot,ETH 2.0 Staking,BNB,-0.001,',
    ];

    const result = await parseBinanceCsv(csv(rows));

    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0].message).toMatch(/ETH 2\.0 Staking.*3 filas|inesperado/i);
  });

  it('ETH 2.0 Staking Withdrawals con 3 filas: error explícito', async () => {
    const rows = [
      '123,2024-01-01 10:00:00,Spot,ETH 2.0 Staking Withdrawals,BETH,-1,',
      '123,2024-01-01 10:00:00,Spot,ETH 2.0 Staking Withdrawals,ETH,1,',
      '123,2024-01-01 10:00:00,Spot,ETH 2.0 Staking Withdrawals,BNB,-0.001,',
    ];

    const result = await parseBinanceCsv(csv(rows));

    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0].message).toMatch(/ETH 2\.0 Staking Withdrawals.*3 filas|inesperado/i);
  });
});
