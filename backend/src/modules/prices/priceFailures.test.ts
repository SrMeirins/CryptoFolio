import { afterEach, describe, expect, it } from 'vitest';
import { clearPriceFailures, getPriceFailure, recordPriceFailure } from './priceFailures';

// Último fallo de precio por activo (#450), en memoria.
afterEach(() => clearPriceFailures());

describe('priceFailures', () => {
  it('guarda el último fallo de cada activo con su fuente, motivo y hora', () => {
    recordPriceFailure('SINT', 'coingecko', 'sin-precio', new Date('2026-01-01T10:00:00Z'));
    recordPriceFailure('SINT', 'coinpaprika', 'sin-respuesta', new Date('2026-01-01T10:05:00Z'));
    expect(getPriceFailure('SINT')).toEqual({ source: 'coinpaprika', reason: 'sin-respuesta', at: '2026-01-01T10:05:00.000Z' });
    expect(getPriceFailure('OTRO')).toBeNull();
  });
});
