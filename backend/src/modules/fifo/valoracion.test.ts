import { describe, expect, it, vi } from 'vitest';

// valoracion.ts importa el precio del momento (y con él la base): se simulan.
vi.mock('../prices/momento', () => ({ getPrecioMomentoEur: vi.fn() }));
const { rangoLiquidez, valorarPermuta, TOLERANCIA_MAYOR } = await import('./valoracion');

// Valor de mercado de una permuta (#599). Datos sintéticos.
describe('rangoLiquidez', () => {
  it('EUR, estables, BTC, ETH, BNB y el resto, en ese orden', () => {
    const orden = ['EUR', 'USDT', 'BTC', 'ETH', 'BNB', 'ABC'].map(rangoLiquidez);
    expect([...orden].sort((a, b) => a - b)).toEqual(orden);
    expect(rangoLiquidez('USDC')).toBe(rangoLiquidez('USDT'));
    expect(rangoLiquidez('XYZ')).toBe(rangoLiquidez('ABC'));
  });
});

describe('valorarPermuta', () => {
  it('dentro de la tolerancia: el valor del lado más líquido, sin depender de cuál se entrega', () => {
    // 100 USDT por 10 ABC; ABC a 10,2 €: 2 % de diferencia.
    const compra = valorarPermuta({ asset: 'USDT', cantidad: 100, precio: 1 }, { asset: 'ABC', cantidad: 10, precio: 10.2 }, false);
    expect(compra).toMatchObject({ valor: 100, criterio: 'momento', valorEntregado: 100, valorRecibido: 102 });
    const venta = valorarPermuta({ asset: 'ABC', cantidad: 10, precio: 10.2 }, { asset: 'USDT', cantidad: 100, precio: 1 }, false);
    expect(venta.valor).toBe(100);
  });

  it('por encima de la tolerancia: el mayor de los dos lados (art. 37.1.h)', () => {
    const v = valorarPermuta({ asset: 'USDT', cantidad: 100, precio: 1 }, { asset: 'ABC', cantidad: 10, precio: 11 }, false);
    expect(TOLERANCIA_MAYOR).toBe(0.03);
    expect(v).toMatchObject({ valor: 110, criterio: 'mayor' });
  });

  it('con precios del día nunca aplica «el mayor»: la diferencia es volatilidad del día', () => {
    const v = valorarPermuta({ asset: 'USDT', cantidad: 100, precio: 1 }, { asset: 'ABC', cantidad: 10, precio: 15 }, true);
    expect(v).toMatchObject({ valor: 100, criterio: 'diario' });
  });

  it('un lado sin precio: se usa el otro', () => {
    expect(valorarPermuta({ asset: 'ABC', cantidad: 10, precio: 0 }, { asset: 'XYZ', cantidad: 5, precio: 3 }, false).valor).toBe(15);
    expect(valorarPermuta({ asset: 'ABC', cantidad: 10, precio: 2 }, { asset: 'XYZ', cantidad: 5, precio: 0 }, false).valor).toBe(20);
  });

  it('a igual liquidez, el lado entregado', () => {
    expect(valorarPermuta({ asset: 'ABC', cantidad: 10, precio: 2 }, { asset: 'XYZ', cantidad: 5, precio: 4.04 }, false).valor).toBe(20);
  });
});
