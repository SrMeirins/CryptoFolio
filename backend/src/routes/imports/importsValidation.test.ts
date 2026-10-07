import { describe, expect, it } from 'vitest';
import { hasBinaryMagic, parseWithdrawalDestinations, parseDepositCosts } from './importsValidation';

// importsValidation.ts no tenía ningún test propio (vivía disperso dentro de
// imports.ts sin test en absoluto).
describe('hasBinaryMagic', () => {
  it('detecta un ejecutable ELF (Linux)', () => {
    expect(hasBinaryMagic(Buffer.from([0x7f, 0x45, 0x4c, 0x46, 0, 0]))).toBe(true);
  });

  it('detecta un PNG', () => {
    expect(hasBinaryMagic(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0]))).toBe(true);
  });

  it('detecta un ZIP/DOCX/XLSX', () => {
    expect(hasBinaryMagic(Buffer.from([0x50, 0x4b, 0x03, 0x04]))).toBe(true);
  });

  it('un CSV de texto plano no se detecta como binario', () => {
    expect(hasBinaryMagic(Buffer.from('User ID,Time,Account\n123,2024-01-01,Spot', 'utf-8'))).toBe(false);
  });

  it('un buffer vacío no lanza ni se detecta como binario', () => {
    expect(hasBinaryMagic(Buffer.alloc(0))).toBe(false);
  });
});

describe('parseWithdrawalDestinations', () => {
  it('sin valor, devuelve objeto vacío', () => {
    expect(parseWithdrawalDestinations(undefined)).toEqual({});
  });

  it('acepta un mapa hash→wallet_id válido', () => {
    expect(parseWithdrawalDestinations('{"hash1":"wallet-a","hash2":"wallet-b"}'))
      .toEqual({ hash1: 'wallet-a', hash2: 'wallet-b' });
  });

  it('rechaza un array en vez de objeto', () => {
    expect(() => parseWithdrawalDestinations('["no","es","un","objeto"]')).toThrow('withdrawalDestinations inválido');
  });

  it('rechaza valores no-string', () => {
    expect(() => parseWithdrawalDestinations('{"hash1":123}')).toThrow('withdrawalDestinations inválido');
  });

  it('un JSON mal formado lanza (JSON.parse, no el schema)', () => {
    expect(() => parseWithdrawalDestinations('{no es json')).toThrow();
  });
});

describe('parseDepositCosts', () => {
  it('sin valor, devuelve objeto vacío', () => {
    expect(parseDepositCosts(undefined)).toEqual({});
  });

  it('acepta números y null (null = usuario marcó "desconocido")', () => {
    expect(parseDepositCosts('{"id1":100.5,"id2":null}')).toEqual({ id1: 100.5, id2: null });
  });

  it('rechaza valores string', () => {
    expect(() => parseDepositCosts('{"id1":"100"}')).toThrow('depositCosts inválido');
  });

  it('rechaza un array en vez de objeto', () => {
    expect(() => parseDepositCosts('[1,2,3]')).toThrow('depositCosts inválido');
  });
});
