import { describe, expect, it } from 'vitest';
import { nextDisabledPairs } from './disabledPairs';

// Pares quitados a mano en Ajustes (#277).
describe('nextDisabledPairs', () => {
  it('vaciar un par que tenía valor lo desactiva', () => {
    expect(nextDisabledPairs([], { eur: 'XRPEUR', usdt: 'XRPUSDT' }, { eur: 'XRPEUR', usdt: null })).toEqual(['usdt']);
  });
  it('rellenar un par desactivado lo reactiva', () => {
    expect(nextDisabledPairs(['usdt'], { usdt: null }, { usdt: 'XRPUSDT' })).toEqual([]);
  });
  it('un par que nunca tuvo valor y sigue vacío no se desactiva (lo puede rellenar la detección)', () => {
    expect(nextDisabledPairs([], { btc: null }, { btc: null })).toEqual([]);
  });
  it('conserva los no editables desde Ajustes (ETH)', () => {
    expect(nextDisabledPairs(['eth'], { eur: 'XRPEUR' }, { eur: 'XRPEUR' })).toEqual(['eth']);
  });
});
