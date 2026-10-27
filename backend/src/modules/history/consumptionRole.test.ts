import { describe, expect, it } from 'vitest';
import { consumptionRole } from './consumptionRole';

// Papel de cada consumo FIFO (#405).
describe('consumptionRole (#405)', () => {
  it('retiro y transferencia: traslado sin efecto fiscal; con efecto, comisión de red', () => {
    expect(consumptionRole('WITHDRAW', 'ONDO', 'NONE')).toBe('traslado');
    expect(consumptionRole('WITHDRAW', 'ONDO', 'GAIN')).toBe('comision_red');
    expect(consumptionRole('TRANSFER_INTERNAL', 'XRP', 'NONE')).toBe('traslado');
    expect(consumptionRole('STAKING_LOCK', 'ETH', 'NONE')).toBe('traslado');
  });

  it('ventas, y compras de fiat como venta; compra con cripto como permuta', () => {
    expect(consumptionRole('SELL', 'BTC', 'GAIN')).toBe('venta');
    expect(consumptionRole('SELL_CRYPTO', 'BTC', 'LOSS')).toBe('venta');
    expect(consumptionRole('BUY', 'EUR', 'GAIN')).toBe('venta');
    expect(consumptionRole('BUY_CRYPTO', 'XRP', 'GAIN')).toBe('permuta');
  });

  it('comisiones, pérdidas, donaciones y margen', () => {
    expect(consumptionRole('FEE_EXCHANGE', 'BNB', 'GAIN')).toBe('comision');
    expect(consumptionRole('LOST', 'LUNC', 'LOSS')).toBe('perdida');
    expect(consumptionRole('GIFT_SENT', 'XRP', 'GAIN')).toBe('donacion');
    expect(consumptionRole('MARGIN_REPAY', 'USDT', 'NONE')).toBe('devolucion_margen');
    expect(consumptionRole('MARGIN_REPAY', 'USDT', 'LOSS')).toBe('intereses_margen');
    expect(consumptionRole('AIRDROP', 'X', 'NONE')).toBe('otro');
  });
});
