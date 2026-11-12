import { describe, expect, it, vi } from 'vitest';

// Resolución de la custodia por fecha (#545): pura. Datos sintéticos.
vi.mock('../../db/client', () => ({ db: {} }));
const { custodiaEn } = await import('./custodia');

const binance = { id: 'w1', name: 'Binance Spot', is_system: true };
const bitvavo = { id: 'w2', name: 'Bitvavo', is_system: true };
const propia = { id: 'w3', name: 'Binance Spot copia', is_system: false };

describe('custodiaEn', () => {
  it('regla automática de Binance por fechas, desde el 7 de julio de 2022', () => {
    expect(custodiaEn(binance, [], '2022-07-06')).toMatchObject({ enEspana: false, origen: 'automatico', regla: 'binance' });
    expect(custodiaEn(binance, [], '2022-07-07')).toMatchObject({ enEspana: true, origen: 'automatico', entidad: { nombre: 'Binance Spain, S.L.' } });
  });
  it('Bitvavo, siempre en los Países Bajos', () => {
    expect(custodiaEn(bitvavo, [], '2020-01-01')).toMatchObject({ enEspana: false, entidad: { pais: 'NL' } });
  });
  it('solo las wallets del sistema tienen regla: una propia con el mismo nombre no', () => {
    expect(custodiaEn(propia, [], '2024-01-01')).toMatchObject({ enEspana: null, origen: 'desconocido', regla: null });
  });
  it('lo del usuario manda desde su fecha; antes, la regla automática', () => {
    const filas = [{ id: 'f1', walletId: 'w1', desde: '2023-01-01', enEspana: false, entidad: null }];
    expect(custodiaEn(binance, filas, '2022-12-31')).toMatchObject({ enEspana: true, origen: 'automatico' });
    expect(custodiaEn(binance, filas, '2023-01-01')).toMatchObject({ enEspana: false, origen: 'usuario', filaId: 'f1' });
  });
});
