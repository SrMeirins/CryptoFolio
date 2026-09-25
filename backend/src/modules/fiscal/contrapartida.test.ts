import { describe, expect, it } from 'vitest';
import { getContrapartidaClave } from './contrapartida';

describe('getContrapartidaClave', () => {
  it('moneda fiduciaria → D', () => {
    for (const c of ['EUR', 'USD', 'GBP', 'CHF']) expect(getContrapartidaClave(c).clave).toBe('D');
  });
  // Las stablecoins no son moneda de curso legal (criterio DGT): clave V.
  it('stablecoins (USDT/USDC/BUSD/DAI) → V, no D', () => {
    for (const c of ['USDT', 'USDC', 'BUSD', 'DAI']) expect(getContrapartidaClave(c).clave).toBe('V');
  });
  it('cripto → V; sin contrapartida → O', () => {
    expect(getContrapartidaClave('BTC').clave).toBe('V');
    expect(getContrapartidaClave(null).clave).toBe('O');
  });
});
