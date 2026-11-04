import { describe, expect, it } from 'vitest';
import { activoRecibido, getContraprestacion, type ConsumoFiscal } from './contrapartida';

// Claves de la casilla 1800 (#531): F, N, B o sin clave para revisar. Datos sintéticos.
const c = (operationType: string, activoTransmitido: string, txAsset: string | null, costAsset: string | null, feeAsset: string | null = null): ConsumoFiscal =>
  ({ operationType, activoTransmitido, txAsset, costAsset, feeAsset });
const clave = (x: ConsumoFiscal) => getContraprestacion(x).clave;

describe('getContraprestacion', () => {
  it('venta por moneda de curso legal: F', () => {
    for (const fiat of ['EUR', 'USD', 'GBP', 'CHF']) expect(clave(c('SELL', 'AAA', 'AAA', fiat))).toBe('F');
    // Comprar EUR entregando cripto también es una venta.
    expect(clave(c('BUY_FIAT', 'AAA', 'EUR', 'AAA'))).toBe('F');
    expect(getContraprestacion(c('SELL', 'AAA', 'AAA', 'EUR')).descripcion).toBe('Moneda de curso legal, EUR (F)');
  });

  it('permuta por otra cripto o stablecoin: N, nunca F', () => {
    expect(clave(c('SELL', 'AAA', 'AAA', 'BBB'))).toBe('N');
    expect(clave(c('BUY_CRYPTO', 'AAA', 'BBB', 'AAA'))).toBe('N');
    for (const s of ['USDT', 'USDC', 'BUSD', 'DAI']) expect(clave(c('SELL', 'AAA', 'AAA', s))).toBe('N');
  });

  it('comisiones, comisión de red de un traspaso e intereses de margen: B', () => {
    for (const op of ['FEE', 'FEE_EXCHANGE', 'FEE_NETWORK']) expect(clave(c(op, 'BNB', 'BNB', null))).toBe('B');
    expect(clave(c('WITHDRAW', 'AAA', 'AAA', null, 'AAA'))).toBe('B');
    expect(clave(c('TRANSFER_INTERNAL', 'AAA', 'AAA', null, 'AAA'))).toBe('B');
    expect(clave(c('MARGIN_REPAY', 'AAA', 'AAA', null))).toBe('B');
  });

  it('comisión en un tercer activo dentro de una venta: B, no permuta por el activo vendido', () => {
    const fee = c('SELL', 'BNB', 'AAA', 'EUR', 'BNB');
    expect(clave(fee)).toBe('B');
    expect(activoRecibido(fee)).toBeNull();
    // La propia venta sigue siendo F.
    expect(clave(c('SELL', 'AAA', 'AAA', 'EUR', 'BNB'))).toBe('F');
  });

  it('donaciones y pérdidas: sin clave y para revisar', () => {
    for (const op of ['GIFT_SENT', 'LOST']) {
      const r = getContraprestacion(c(op, 'AAA', 'AAA', null));
      expect(r).toMatchObject({ clave: '', revisar: true });
    }
  });

  it('nunca devuelve las claves antiguas D, V ni O', () => {
    const casos = [c('SELL', 'AAA', 'AAA', 'EUR'), c('SELL', 'AAA', 'AAA', 'BBB'), c('FEE', 'BNB', 'BNB', null), c('LOST', 'AAA', 'AAA', null)];
    for (const x of casos) expect(['D', 'V', 'O']).not.toContain(clave(x));
  });
});
