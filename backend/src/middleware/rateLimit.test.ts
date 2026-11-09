import { describe, expect, it } from 'vitest';
import { rateLimitMax, RATE_LIMIT_MAX_DEFAULT } from './rateLimit';

// Límite de peticiones configurable (RATE_LIMIT_MAX): un valor válido se usa;
// cualquier otro deja el de siempre, nunca sin límite.
describe('rateLimitMax', () => {
  it('sin configurar, el de siempre', () => {
    expect(rateLimitMax(undefined)).toBe(RATE_LIMIT_MAX_DEFAULT);
    expect(rateLimitMax('')).toBe(RATE_LIMIT_MAX_DEFAULT);
    expect(RATE_LIMIT_MAX_DEFAULT).toBe(5000);
  });

  it('un entero válido se usa', () => {
    expect(rateLimitMax('50000')).toBe(50000);
    expect(rateLimitMax('1')).toBe(1);
  });

  it('un valor no válido no quita el límite', () => {
    for (const raw of ['0', '-5', '2.5', 'abc', '1e9', 'Infinity', '9999999']) {
      expect(rateLimitMax(raw)).toBe(RATE_LIMIT_MAX_DEFAULT);
    }
  });
});
