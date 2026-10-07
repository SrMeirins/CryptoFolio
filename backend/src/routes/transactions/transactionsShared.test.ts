import { describe, expect, it, vi } from 'vitest';

// transactionsShared.ts no tenía ningún test propio — las funciones de
// derivación vivían duplicadas inline en POST /manual y PUT /:id, sin
// extraer ni testear. getHistoricalPriceEur se mockea para no depender de
// red; runFifoEngine se mockea para probar respondWithFifoRecalc sin BD.
const { getHistoricalPriceEurMock } = vi.hoisted(() => ({
  getHistoricalPriceEurMock: vi.fn(),
}));
vi.mock('../../modules/prices/binance', () => ({
  getHistoricalPriceEur: getHistoricalPriceEurMock,
}));

const { runFifoEngineMock } = vi.hoisted(() => ({ runFifoEngineMock: vi.fn() }));
vi.mock('../../modules/fifo/engine', () => ({
  runFifoEngine: runFifoEngineMock,
}));

import {
  resolveFinalAssetAmount, resolveFinalPricePerUnit, resolveCostAsset,
  resolveFinalCostAmount, respondWithFifoRecalc,
} from './transactionsShared';

describe('resolveFinalAssetAmount', () => {
  it('ops normales usan asset/amount directamente', () => {
    expect(resolveFinalAssetAmount('BUY', 'BTC', 1, null, null)).toEqual({ finalAsset: 'BTC', finalAmount: 1 });
  });

  it('ops de fee usan feeAsset/feeAmount si están presentes', () => {
    expect(resolveFinalAssetAmount('FEE_NETWORK', 'BTC', 1, 'ETH', 0.01)).toEqual({ finalAsset: 'ETH', finalAmount: 0.01 });
  });

  it('ops de fee caen a asset/amount si feeAsset/feeAmount no vienen', () => {
    expect(resolveFinalAssetAmount('FEE_EXCHANGE', 'BTC', 1, null, null)).toEqual({ finalAsset: 'BTC', finalAmount: 1 });
  });
});

describe('resolveFinalPricePerUnit', () => {
  it('FORK siempre devuelve 0, sin consultar precio histórico', async () => {
    const result = await resolveFinalPricePerUnit('FORK', null, 'BTC', '2024-01-01');
    expect(result).toBe(0);
    expect(getHistoricalPriceEurMock).not.toHaveBeenCalled();
  });

  it('si pricePerUnit ya viene informado, se respeta sin consultar', async () => {
    const result = await resolveFinalPricePerUnit('BUY', 50000, 'BTC', '2024-01-01');
    expect(result).toBe(50000);
    expect(getHistoricalPriceEurMock).not.toHaveBeenCalled();
  });

  it('sin finalAsset, devuelve null sin consultar', async () => {
    const result = await resolveFinalPricePerUnit('BUY', null, null, '2024-01-01');
    expect(result).toBeNull();
  });

  it('sin pricePerUnit, resuelve contra el histórico', async () => {
    getHistoricalPriceEurMock.mockResolvedValueOnce(42000);
    const result = await resolveFinalPricePerUnit('BUY', null, 'BTC', '2024-01-01');
    expect(result).toBe(42000);
  });

  it('si el histórico falla, devuelve null sin lanzar', async () => {
    getHistoricalPriceEurMock.mockRejectedValueOnce(new Error('sin red'));
    const result = await resolveFinalPricePerUnit('BUY', null, 'BTC', '2024-01-01');
    expect(result).toBeNull();
  });
});

describe('resolveCostAsset', () => {
  it('respeta costAsset explícito', () => {
    expect(resolveCostAsset('BUY', 'USDT')).toBe('USDT');
  });

  it('ops fiat sin costAsset explícito caen a EUR', () => {
    expect(resolveCostAsset('BUY_FIAT', null)).toBe('EUR');
    expect(resolveCostAsset('WITHDRAW_FIAT', null)).toBe('EUR');
  });

  it('ops cripto sin costAsset explícito quedan en null', () => {
    expect(resolveCostAsset('BUY', null)).toBeNull();
  });
});

describe('resolveFinalCostAmount', () => {
  it('FORK siempre es 0', () => {
    expect(resolveFinalCostAmount('FORK', null, 100, 5)).toBe(0);
  });

  it('respeta costAmount explícito', () => {
    expect(resolveFinalCostAmount('BUY', 200, 100, 5)).toBe(200);
  });

  it('sin costAmount, infiere amount × pricePerUnit', () => {
    expect(resolveFinalCostAmount('BUY', null, 100, 5)).toBe(500);
  });

  it('sin pricePerUnit ni amount, queda en null', () => {
    expect(resolveFinalCostAmount('BUY', null, null, null)).toBeNull();
  });
});

describe('respondWithFifoRecalc', () => {
  function fakeRes() {
    const body: { status?: number; json?: unknown } = {};
    return {
      json: (payload: unknown) => { body.json = payload; },
      get body() { return body; },
    };
  }

  it('éxito: success:true con el resultado real del motor', async () => {
    runFifoEngineMock.mockResolvedValueOnce({ lotsCreated: 1, lotsConsumed: 0, errors: [], warnings: [] });
    const res = fakeRes();
    await respondWithFifoRecalc(res as unknown as import('express').Response, 'test context');
    expect(res.body.json).toEqual({ success: true, fifo: { lotsCreated: 1, lotsConsumed: 0, errors: [], warnings: [] } });
  });

  it('fallo: success:true, fifo:null, fifoError genérico — nunca el mensaje crudo del motor', async () => {
    runFifoEngineMock.mockRejectedValueOnce(new Error('detalle interno sensible: fallo de Postgres en fifo_lots'));
    const res = fakeRes();
    await respondWithFifoRecalc(res as unknown as import('express').Response, 'test context');
    const payload = res.body.json as { success: boolean; fifo: null; fifoError: string };
    expect(payload.success).toBe(true);
    expect(payload.fifo).toBeNull();
    expect(payload.fifoError).not.toContain('detalle interno sensible');
    expect(payload.fifoError).not.toContain('fifo_lots');
  });
});
