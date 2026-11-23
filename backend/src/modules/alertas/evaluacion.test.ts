import { describe, expect, it } from 'vitest';
import { cambioCartera, decidirCartera, decidirPrecio, enMoneda } from './evaluacion';

// Evaluación de alertas (#519) con precios sintéticos.
describe('decidirPrecio', () => {
  const encima = { sentido: 'por_encima' as const, precio: 100, repeticion: 'una_vez' as const, armada: true };
  it('dispara al cruzar el umbral en su sentido', () => {
    expect(decidirPrecio(encima, 99.99).accion).toBe('nada');
    expect(decidirPrecio(encima, 100).accion).toBe('disparar');
    expect(decidirPrecio({ ...encima, sentido: 'por_debajo' }, 100.5).accion).toBe('nada');
    expect(decidirPrecio({ ...encima, sentido: 'por_debajo' }, 99).accion).toBe('disparar');
  });
  it('«una vez» desarmada no vuelve a dispararse ni se rearma', () => {
    const desarmada = { ...encima, armada: false };
    expect(decidirPrecio(desarmada, 150).accion).toBe('nada');
    expect(decidirPrecio(desarmada, 50).accion).toBe('nada');
  });
  it('«cada vez» se rearma al volver al otro lado con un 1 % de margen', () => {
    const cada = { ...encima, repeticion: 'cada_vez' as const, armada: false };
    expect(decidirPrecio(cada, 99.5).accion).toBe('nada');
    expect(decidirPrecio(cada, 99).accion).toBe('rearmar');
    expect(decidirPrecio({ ...cada, sentido: 'por_debajo' }, 100.5).accion).toBe('nada');
    expect(decidirPrecio({ ...cada, sentido: 'por_debajo' }, 101).accion).toBe('rearmar');
  });
  it('sin precio válido, nada', () => {
    expect(decidirPrecio(encima, 0).accion).toBe('nada');
    expect(decidirPrecio(encima, Number.NaN).accion).toBe('nada');
  });
});

describe('enMoneda', () => {
  it('en USD divide por el USDT en EUR; sin él, sin precio', () => {
    expect(enMoneda(90, 'EUR', null)).toBe(90);
    expect(enMoneda(90, 'USD', 0.9)).toBeCloseTo(100, 9);
    expect(enMoneda(90, 'USD', null)).toBeNull();
    expect(enMoneda(null, 'EUR', 1)).toBeNull();
  });
});

describe('cartera', () => {
  const q = new Map([['AAA', 2], ['BBB', 1], ['SINPRECIO', 5]]);
  it('cambio en 24 h con las cantidades actuales; solo activos con ambos precios', () => {
    // Ahora 2·110 + 1·45 = 265; hace 24 h 2·100 + 1·50 = 250: +6 %.
    expect(cambioCartera(q, new Map([['AAA', 110], ['BBB', 45]]), new Map([['AAA', 100], ['BBB', 50]]))).toBeCloseTo(6, 9);
    expect(cambioCartera(q, new Map(), new Map())).toBeNull();
  });
  it('dispara en cualquier sentido y como mucho una vez cada 24 h', () => {
    const ahora = new Date('2026-11-20T12:00:00Z');
    expect(decidirCartera(5, 6, null, ahora)).toBe(true);
    expect(decidirCartera(5, -7, null, ahora)).toBe(true);
    expect(decidirCartera(5, 4.9, null, ahora)).toBe(false);
    expect(decidirCartera(5, 8, new Date('2026-11-20T00:00:00Z'), ahora)).toBe(false);
    expect(decidirCartera(5, 8, new Date('2026-11-19T11:00:00Z'), ahora)).toBe(true);
    expect(decidirCartera(5, null, null, ahora)).toBe(false);
  });
});
