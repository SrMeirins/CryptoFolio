import { describe, expect, it } from 'vitest';
import { exceedsMaxLength, MAX_LENGTH_LONG, MAX_LENGTH_SHORT } from './textLength';

describe('exceedsMaxLength', () => {
  it('devuelve false para un valor dentro del límite', () => {
    expect(exceedsMaxLength('a'.repeat(MAX_LENGTH_SHORT), MAX_LENGTH_SHORT)).toBe(false);
  });

  it('devuelve true para un valor que excede el límite en 1 carácter', () => {
    expect(exceedsMaxLength('a'.repeat(MAX_LENGTH_SHORT + 1), MAX_LENGTH_SHORT)).toBe(true);
  });

  it('devuelve false para undefined (la validación de presencia es responsabilidad de cada endpoint)', () => {
    expect(exceedsMaxLength(undefined, MAX_LENGTH_SHORT)).toBe(false);
  });

  it('devuelve false para null', () => {
    expect(exceedsMaxLength(null, MAX_LENGTH_SHORT)).toBe(false);
  });

  it('respeta el límite largo por separado', () => {
    expect(exceedsMaxLength('a'.repeat(MAX_LENGTH_LONG), MAX_LENGTH_LONG)).toBe(false);
    expect(exceedsMaxLength('a'.repeat(MAX_LENGTH_LONG + 1), MAX_LENGTH_LONG)).toBe(true);
  });
});
