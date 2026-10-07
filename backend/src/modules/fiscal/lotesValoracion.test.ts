import { describe, expect, it } from 'vitest';
import { sumaValorCustodiaExchange, LoteValorizado } from './lotesValoracion';

// sumaValorCustodiaExchange es la función nueva que unifica el criterio de
// "solo custodia de terceros computa para el Modelo 721", antes duplicado
// por separado en /summary y /modelo721 de routes/fiscal.ts.
function lote(overrides: Partial<LoteValorizado>): LoteValorizado {
  return {
    asset: 'BTC', wallet_id: 'w1', wallet_name: 'Test', wallet_kind: 'hardware',
    wallet_color: '#fff', quantity: 1, costBasisEur: 100, precioEur: 100, valorEur: 100,
    ...overrides,
  };
}

describe('sumaValorCustodiaExchange', () => {
  it('suma solo los lotes en wallets tipo exchange', () => {
    const activos = [
      lote({ wallet_kind: 'exchange', valorEur: 30_000 }),
      lote({ wallet_kind: 'hardware', valorEur: 25_000 }),
      lote({ wallet_kind: 'software', valorEur: 5_000 }),
    ];
    expect(sumaValorCustodiaExchange(activos)).toBe(30_000);
  });

  it('sin lotes en exchange, devuelve 0', () => {
    expect(sumaValorCustodiaExchange([lote({ wallet_kind: 'hardware' })])).toBe(0);
  });

  it('con lista vacía, devuelve 0', () => {
    expect(sumaValorCustodiaExchange([])).toBe(0);
  });
});
