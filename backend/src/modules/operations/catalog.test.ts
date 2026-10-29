import { describe, expect, it } from 'vitest';
import { CATEGORY_META, OPERATION_CATALOG, getOperationsByCategory, getOperationType } from './catalog';
import { DB_OPERATION_TYPES } from '../history/operationGroups';

describe('OPERATION_CATALOG', () => {
  it('mantiene los 21 tipos creables y los 2 de margen solo editables (#394)', () => {
    expect(OPERATION_CATALOG).toHaveLength(23);
    expect(OPERATION_CATALOG.filter((op) => op.editOnly).map((op) => op.id)).toEqual(['MARGIN_BORROW', 'MARGIN_REPAY']);
  });

  it('todos los ids son tipos de la base de datos', () => {
    for (const op of OPERATION_CATALOG) {
      expect(DB_OPERATION_TYPES).toContain(op.id);
    }
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
