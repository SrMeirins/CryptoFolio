import { describe, expect, it } from 'vitest';
import { parseBitvavoCsv } from './bitvavoParser';

// bitvavoParser.ts no tenía ningún test propio hasta ahora. Cubre: la
// conversión UTC con timezone IANA (toUtcDate, incluido verano/invierno),
// las 4 heurísticas de fee-ya-incluido documentadas en el propio código, y
// los 4 tipos de operación reconocidos + el rechazo explícito de tipos
// desconocidos.

const HEADER = 'Timezone,Date,Time,Type,Currency,Amount,Quote Currency,Quote Price,Received / Paid Currency,Received / Paid Amount,Fee currency,Fee amount,Status,Transaction ID,Address';

function csv(rows: string[]): string {
  return [HEADER, ...rows].join('\n');
}

describe('parseBitvavoCsv — toUtcDate (conversión de zona horaria)', () => {
  it('convierte correctamente en horario de verano (CEST, UTC+2)', async () => {
    // 16:23:06 CEST (03-sep) = 14:23:06 UTC
    const rows = ['Europe/Madrid,2026-09-03,16:23:06,deposit,EUR,100,,,,,,,Completed,tx-1,'];
    const result = parseBitvavoCsv(csv(rows));
    expect(result.transactions[0].timestamp.toISOString()).toBe('2026-09-03T14:23:06.000Z');
  });

  it('convierte correctamente en horario de invierno (CET, UTC+1)', async () => {
    // 10:00:00 CET (15-ene) = 09:00:00 UTC
    const rows = ['Europe/Madrid,2026-01-15,10:00:00,deposit,EUR,100,,,,,,,Completed,tx-2,'];
    const result = parseBitvavoCsv(csv(rows));
    expect(result.transactions[0].timestamp.toISOString()).toBe('2026-01-15T09:00:00.000Z');
  });

  it('preserva los milisegundos cuando el CSV los incluye', async () => {
    const rows = ['Europe/Madrid,2026-09-03,16:23:06.585,deposit,EUR,100,,,,,,,Completed,tx-3,'];
    const result = parseBitvavoCsv(csv(rows));
    expect(result.transactions[0].timestamp.toISOString()).toBe('2026-09-03T14:23:06.585Z');
  });

  it('fila con fecha/hora inválida se reporta como error, no bloquea el resto del CSV', async () => {
    const rows = [
      'Europe/Madrid,fecha-invalida,16:23:06,deposit,EUR,100,,,,,,,Completed,tx-bad,',
      'Europe/Madrid,2026-09-03,16:23:06,deposit,EUR,50,,,,,,,Completed,tx-good,',
    ];
    const result = parseBitvavoCsv(csv(rows));
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.transactions).toHaveLength(1);
  });
});

describe('parseBitvavoCsv — buy (fee ya incluido en Received/Paid Amount)', () => {
  it('fee en la misma moneda que costAsset: no se registra feeAsset/feeAmount aparte (ya incluido)', async () => {
    const rows = ['Europe/Madrid,2026-09-03,16:23:06,buy,ONDO,334.25497297,EUR,0.30994,EUR,-103.86,EUR,0.26,Completed,tx-buy,'];
    const result = parseBitvavoCsv(csv(rows));
    const tx = result.transactions[0];
    expect(tx.operationType).toBe('BUY');
    expect(tx.asset).toBe('ONDO');
    expect(tx.costAsset).toBe('EUR');
    expect(tx.costAmount).toBeCloseTo(103.86, 6);
    expect(tx.feeAsset).toBeUndefined();
    expect(tx.feeAmount).toBeUndefined();
  });

  it('fee en moneda distinta a costAsset: se registra feeAsset/feeAmount como disposición aparte', async () => {
    const rows = ['Europe/Madrid,2026-09-03,16:23:06,buy,ONDO,100,EUR,0.3,EUR,-30,BNB,0.01,Completed,tx-buy2,'];
    const result = parseBitvavoCsv(csv(rows));
    const tx = result.transactions[0];
    expect(tx.feeAsset).toBe('BNB');
    expect(tx.feeAmount).toBe(0.01);
  });
});

describe('parseBitvavoCsv — deposit', () => {
  it('depósito de fiat (EUR) → DEPOSIT_FIAT, sin needsCostReview', async () => {
    const rows = ['Europe/Madrid,2026-09-03,10:00:00,deposit,EUR,500,,,,,,,Completed,tx-dep-eur,'];
    const result = parseBitvavoCsv(csv(rows));
    const tx = result.transactions[0];
    expect(tx.operationType).toBe('DEPOSIT_FIAT');
    expect(tx.needsCostReview).toBeFalsy();
  });

  it('depósito de cripto externo → DEPOSIT_CRYPTO, con needsCostReview', async () => {
    const rows = ['Europe/Madrid,2026-09-03,10:00:00,deposit,XRP,1000,,,,,,,Completed,tx-dep-xrp,'];
    const result = parseBitvavoCsv(csv(rows));
    const tx = result.transactions[0];
    expect(tx.operationType).toBe('DEPOSIT_CRYPTO');
    expect(tx.needsCostReview).toBe(true);
  });
});

describe('parseBitvavoCsv — withdrawal', () => {
  it('retiro de fiat → WITHDRAW_FIAT, sin lógica de fee', async () => {
    const rows = ['Europe/Madrid,2026-09-03,10:00:00,withdrawal,EUR,-200,,,,,,,Completed,tx-wd-eur,'];
    const result = parseBitvavoCsv(csv(rows));
    const tx = result.transactions[0];
    expect(tx.operationType).toBe('WITHDRAW_FIAT');
    expect(tx.amount).toBe(200);
  });

  it('retiro de cripto con fee en el mismo activo: amount/amountNet descuentan la fee', async () => {
    // amount bruto 604.77982861, fee 3 → neto 601.77982861
    const rows = ['Europe/Madrid,2026-09-03,17:11:51,withdrawal,ONDO,-604.77982861,,,,,ONDO,3,Completed,tx-wd-ondo,'];
    const result = parseBitvavoCsv(csv(rows));
    const tx = result.transactions[0];
    expect(tx.operationType).toBe('WITHDRAW');
    expect(tx.amount).toBeCloseTo(601.77982861, 6);
    expect(tx.amountNet).toBeCloseTo(601.77982861, 6);
    expect(tx.feeAsset).toBe('ONDO');
    expect(tx.feeAmount).toBe(3);
  });

  it('retiro de cripto sin fee en el mismo activo: amount sin descuento, sin feeAsset', async () => {
    const rows = ['Europe/Madrid,2026-09-03,17:11:51,withdrawal,XRP,-100,,,,,,,Completed,tx-wd-xrp,'];
    const result = parseBitvavoCsv(csv(rows));
    const tx = result.transactions[0];
    expect(tx.amount).toBe(100);
    expect(tx.feeAsset).toBeUndefined();
  });
});

describe('parseBitvavoCsv — rebate y tipos desconocidos', () => {
  it('rebate → CASHBACK', async () => {
    const rows = ['Europe/Madrid,2026-09-03,10:00:00,rebate,BNB,0.05,,,,,,,Completed,tx-rebate,'];
    const result = parseBitvavoCsv(csv(rows));
    expect(result.transactions[0].operationType).toBe('CASHBACK');
  });

  it('tipo desconocido: no genera transacción, se reporta explícito en errors', async () => {
    const rows = ['Europe/Madrid,2026-09-03,10:00:00,staking,BNB,10,,,,,,,Completed,tx-unknown,'];
    const result = parseBitvavoCsv(csv(rows));
    expect(result.transactions).toHaveLength(0);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0].message).toMatch(/staking/);
  });

  it('fila con status distinto de Completed se ignora, sin error', async () => {
    const rows = ['Europe/Madrid,2026-09-03,10:00:00,withdrawal,EUR,-50,,,,,,,Canceled,tx-cancel,'];
    const result = parseBitvavoCsv(csv(rows));
    expect(result.transactions).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
  });
});

describe('parseBitvavoCsv — rawRows y hash', () => {
  it('expone rawRows emparejadas con el mismo hash que rawRowHashes de la transacción', async () => {
    const rows = ['Europe/Madrid,2026-09-03,10:00:00,deposit,EUR,500,,,,,,,Completed,tx-hash,'];
    const result = parseBitvavoCsv(csv(rows));
    expect(result.rawRows).toHaveLength(1);
    expect(result.rawRows[0].hash).toBe(result.transactions[0].rawRowHashes[0]);
  });

  it('CSV vacío devuelve stats en cero sin lanzar', async () => {
    const result = parseBitvavoCsv(HEADER);
    expect(result.transactions).toHaveLength(0);
    expect(result.rawRows).toEqual([]);
    expect(result.stats.totalRows).toBe(0);
  });
});
