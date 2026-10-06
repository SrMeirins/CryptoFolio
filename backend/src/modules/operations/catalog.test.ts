import { describe, expect, it } from 'vitest';
import { CATEGORY_META, OPERATION_CATALOG, getOperationsByCategory, getOperationType } from './catalog';

describe('OPERATION_CATALOG', () => {
  it('mantiene los 21 tipos de operacion tras fragmentar en modules/operations/', () => {
    expect(OPERATION_CATALOG).toHaveLength(21);
  });

  it('no tiene ids duplicados entre las 6 categorias', () => {
    const ids = OPERATION_CATALOG.map((op) => op.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('cada operacion pertenece a una categoria presente en CATEGORY_META', () => {
    for (const op of OPERATION_CATALOG) {
      expect(CATEGORY_META).toHaveProperty(op.category);
    }
  });

  it('cada operacion declara al menos un campo', () => {
    for (const op of OPERATION_CATALOG) {
      expect(op.fields.length).toBeGreaterThan(0);
    }
  });
});

describe('getOperationType', () => {
  it('devuelve la operacion por id exacto', () => {
    expect(getOperationType('BUY_CRYPTO')?.fiscalTreatment).toBe('CAPITAL_GAIN_LOSS');
  });

  it('devuelve undefined para un id inexistente', () => {
    expect(getOperationType('NO_EXISTE')).toBeUndefined();
  });
});

describe('getOperationsByCategory', () => {
  it('filtra correctamente por categoria', () => {
    const disposiciones = getOperationsByCategory('DISPOSITION');
    expect(disposiciones.map((op) => op.id).sort()).toEqual(
      ['GIFT_SENT', 'LOST', 'SELL_CRYPTO', 'SELL_FIAT'].sort()
    );
  });

  it('devuelve array vacio si una categoria no tiene operaciones (no aplica aqui, pero no debe lanzar)', () => {
    expect(() => getOperationsByCategory('FEE')).not.toThrow();
  });
});
