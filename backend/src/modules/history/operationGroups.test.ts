import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import {
  ACQUISITION_TYPES, BUY_TYPES, DB_OPERATION_TYPES, DISPOSAL_TYPES, FEE_TYPES, INFLOW_TYPES, INVESTMENT_TYPES,
  OTHER_OUT_TYPES, OUTFLOW_TYPES, SELL_TYPES, sqlList,
} from './operationGroups';

describe('operationGroups', () => {
  it('DB_OPERATION_TYPES coincide con el enum operation_type de schema.sql', () => {
    const schema = readFileSync(path.join(__dirname, '../../db/schema.sql'), 'utf-8');
    const body = schema.match(/CREATE TYPE operation_type AS ENUM \(([\s\S]*?)\);/)?.[1] ?? '';
    const enumValues = [...body.matchAll(/'([A-Z_]+)'/g)].map(m => m[1]);
    expect([...DB_OPERATION_TYPES].sort()).toEqual(enumValues.sort());
  });

  it('cada grupo solo contiene tipos de la BD', () => {
    const all = new Set<string>(DB_OPERATION_TYPES);
    for (const g of [ACQUISITION_TYPES, DISPOSAL_TYPES, INFLOW_TYPES, OUTFLOW_TYPES, BUY_TYPES, SELL_TYPES, FEE_TYPES]) {
      for (const t of g) expect(all.has(t), t).toBe(true);
    }
  });

  it('un tipo nunca es entrada y salida a la vez, ni adquisición y disposición', () => {
    expect(INFLOW_TYPES.filter(t => OUTFLOW_TYPES.includes(t))).toEqual([]);
    expect(ACQUISITION_TYPES.filter(t => DISPOSAL_TYPES.includes(t))).toEqual([]);
  });

  it('Ventas excluye pérdidas y regalos; Invertido es un subconjunto de las compras', () => {
    expect(SELL_TYPES.filter(t => OTHER_OUT_TYPES.includes(t))).toEqual([]);
    expect(INVESTMENT_TYPES.every(t => BUY_TYPES.includes(t))).toBe(true);
  });

  it('sqlList solo admite constantes en mayúsculas (sin inyección)', () => {
    expect(sqlList(['BUY', 'SELL'])).toBe("('BUY','SELL')");
    expect(() => sqlList(["BUY') OR ('1'='1"])).toThrow();
  });
});
