import { describe, expect, it } from 'vitest';
import { getProviderForNetwork, registerProvider } from './registry';
import type { BalanceProvider } from './types';

describe('providers/registry', () => {
  it('devuelve undefined para una red no registrada', () => {
    expect(getProviderForNetwork('Red Inventada')).toBeUndefined();
  });

  it('devuelve el proveedor registrado por nombre exacto de red', () => {
    const fake: BalanceProvider = { requiresApiKey: false, getBalance: async () => ({ ok: true, balance: 1 }) };
    registerProvider('__Test Network__', fake);
    expect(getProviderForNetwork('__Test Network__')).toBe(fake);
  });
});
