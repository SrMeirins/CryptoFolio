import { describe, expect, it } from 'vitest';
import { OPS_BASE_GENERAL, OPS_RCM_AHORRO, OPS_RENTA_ESPECIE, baseDeRenta } from './clasificacionRentas';

describe('clasificacionRentas (#537)', () => {
  it('staking y lending van a la base del ahorro', () => {
    for (const op of ['STAKING_REWARD', 'LENDING_INTEREST', 'LENDING_INTEREST_LOCKED']) expect(baseDeRenta(op)).toBe('ahorro');
  });
  it('airdrop, minería y cashback van a la base general', () => {
    for (const op of ['AIRDROP', 'MINING_REWARD', 'CASHBACK']) expect(baseDeRenta(op)).toBe('general');
  });
  it('las dos listas no se solapan y juntas son todas las rentas en especie', () => {
    expect(OPS_RCM_AHORRO.filter(o => OPS_BASE_GENERAL.includes(o))).toEqual([]);
    expect(OPS_RENTA_ESPECIE).toHaveLength(6);
  });
});
