import { describe, expect, it } from 'vitest';
import { MAX_METAS, metasSchema } from './metas';

// Validación de las metas (#520) con datos sintéticos.
const valor = { id: 'meta-0001', nombre: 'Cartera', tipo: 'valor', objetivo: 10000, moneda: 'EUR' };
const aportado = { id: 'meta-0002', nombre: 'Aportar este año', tipo: 'aportado', objetivo: 1200, moneda: 'USD' };
const cantidad = { id: 'meta-0003', nombre: 'Acumular', tipo: 'cantidad', objetivo: 0.5, activo: 'BTC' };
const ok = (v: unknown) => metasSchema.safeParse(JSON.stringify(v)).success;

describe('metasSchema', () => {
  it('acepta la lista vacía y los tres tipos', () => {
    expect(ok([])).toBe(true);
    expect(ok([valor, aportado, cantidad])).toBe(true);
  });

  it(`rechaza más de ${MAX_METAS} metas y los id repetidos`, () => {
    const muchas = Array.from({ length: MAX_METAS + 1 }, (_, i) => ({ ...valor, id: `meta-000${i}x` }));
    expect(ok(muchas)).toBe(false);
    expect(ok([valor, { ...aportado, id: valor.id }])).toBe(false);
  });

  it('rechaza objetivos no positivos, campos de otro tipo y campos de más', () => {
    expect(ok([{ ...valor, objetivo: 0 }])).toBe(false);
    expect(ok([{ ...valor, objetivo: -5 }])).toBe(false);
    expect(ok([{ ...valor, activo: 'BTC' }])).toBe(false);
    expect(ok([{ ...cantidad, moneda: 'EUR' }])).toBe(false);
    expect(ok([{ ...valor, extra: 1 }])).toBe(false);
    expect(ok([{ ...valor, tipo: 'otro' }])).toBe(false);
  });

  it('rechaza nombres vacíos o largos, símbolos y monedas no válidos, y JSON roto', () => {
    expect(ok([{ ...valor, nombre: '   ' }])).toBe(false);
    expect(ok([{ ...valor, nombre: 'x'.repeat(41) }])).toBe(false);
    expect(ok([{ ...cantidad, activo: 'btc<script>' }])).toBe(false);
    expect(ok([{ ...valor, moneda: 'GBP' }])).toBe(false);
    expect(ok([{ ...valor, id: '../..' }])).toBe(false);
    expect(metasSchema.safeParse('{no es json').success).toBe(false);
    expect(metasSchema.safeParse('{"a":1}').success).toBe(false);
  });

  it('el nombre con HTML se guarda tal cual: se escapa al pintarlo', () => {
    expect(ok([{ ...valor, nombre: '<b>Meta</b>' }])).toBe(true);
  });
});
