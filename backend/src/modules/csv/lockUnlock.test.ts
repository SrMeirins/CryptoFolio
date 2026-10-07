import { describe, expect, it } from 'vitest';
import { parseBinanceCsv } from './parser';

// tryInterpretLockUnlock colapsa 8 patrones casi idénticos (antes 8 bloques
// de ~12 líneas en parser.ts) en una tabla + una función genérica. Sin test
// dedicado hasta ahora — este fichero fija cada uno de los 8 disparadores,
// incluido el caso de la label combinada de Launchpool (2025+) que se
// desambigua por signo, no por el nombre de la operación.

const HEADER = 'User ID,Time,Account,Operation,Coin,Change,Remark';

function csv(rows: string[]): string {
  return [HEADER, ...rows].join('\n');
}

describe('parseBinanceCsv — bloqueo/desbloqueo (lockUnlock colapsado)', () => {
  it('Staking Purchase (fila negativa) → STAKING_LOCK', async () => {
    const result = await parseBinanceCsv(csv(['123,2024-01-01 10:00:00,Spot,Staking Purchase,BNB,-10,']));
    expect(result.transactions).toHaveLength(1);
    expect(result.transactions[0].operationType).toBe('STAKING_LOCK');
    expect(result.transactions[0].amountNet).toBe(10);
  });

  it('Staking Redemption (fila positiva) → STAKING_UNLOCK', async () => {
    const result = await parseBinanceCsv(csv(['123,2024-01-01 10:00:00,Spot,Staking Redemption,BNB,10,']));
    expect(result.transactions[0].operationType).toBe('STAKING_UNLOCK');
  });

  it('Simple Earn Flexible Subscription → STAKING_LOCK', async () => {
    const result = await parseBinanceCsv(csv(['123,2024-01-01 10:00:00,Spot,Simple Earn Flexible Subscription,USDT,-500,']));
    expect(result.transactions[0].operationType).toBe('STAKING_LOCK');
  });

  it('Simple Earn Flexible Redemption → STAKING_UNLOCK', async () => {
    const result = await parseBinanceCsv(csv(['123,2024-01-01 10:00:00,Spot,Simple Earn Flexible Redemption,USDT,500,']));
    expect(result.transactions[0].operationType).toBe('STAKING_UNLOCK');
  });

  it('Simple Earn Locked Subscription → STAKING_LOCK', async () => {
    const result = await parseBinanceCsv(csv(['123,2024-01-01 10:00:00,Spot,Simple Earn Locked Subscription,SOL,-20,']));
    expect(result.transactions[0].operationType).toBe('STAKING_LOCK');
  });

  it('Simple Earn Locked Redemption → STAKING_UNLOCK', async () => {
    const result = await parseBinanceCsv(csv(['123,2024-01-01 10:00:00,Spot,Simple Earn Locked Redemption,SOL,20,']));
    expect(result.transactions[0].operationType).toBe('STAKING_UNLOCK');
  });

  it('Launchpool Subscription (label clásica) → LAUNCHPOOL_LOCK', async () => {
    const result = await parseBinanceCsv(csv(['123,2024-01-01 10:00:00,Spot,Launchpool Subscription,FDUSD,-100,']));
    expect(result.transactions[0].operationType).toBe('LAUNCHPOOL_LOCK');
  });

  it('Launchpool Redemption (label clásica) → LAUNCHPOOL_UNLOCK', async () => {
    const result = await parseBinanceCsv(csv(['123,2024-01-01 10:00:00,Spot,Launchpool Redemption,FDUSD,100,']));
    expect(result.transactions[0].operationType).toBe('LAUNCHPOOL_UNLOCK');
  });

  it('Launchpool Subscription/Redemption (label combinada 2025+) con fila negativa → LAUNCHPOOL_LOCK', async () => {
    const result = await parseBinanceCsv(csv(['123,2024-01-01 10:00:00,Spot,Launchpool Subscription/Redemption,BNB,-50,']));
    expect(result.transactions[0].operationType).toBe('LAUNCHPOOL_LOCK');
  });

  it('Launchpool Subscription/Redemption (label combinada 2025+) con fila positiva → LAUNCHPOOL_UNLOCK', async () => {
    const result = await parseBinanceCsv(csv(['123,2024-01-01 10:00:00,Spot,Launchpool Subscription/Redemption,BNB,50,']));
    expect(result.transactions[0].operationType).toBe('LAUNCHPOOL_UNLOCK');
  });
});
