import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { sendZodError, zodErrorMessage } from './zodErrors';

// Validación con Zod 4 (#385): mensajes en castellano, 400 sin detalles
// internos y comportamientos de la versión 4 en los que se apoya la API.

const messageOf = (schema: z.ZodType, value: unknown) => {
  const r = schema.safeParse(value);
  if (r.success) throw new Error('debería fallar');
  return zodErrorMessage(r.error);
};

describe('zodErrors (#385)', () => {
  it('los mensajes por defecto llegan en castellano y los propios se mantienen', () => {
    expect(messageOf(z.object({ a: z.string() }), {})).toMatch(/^a: .*(esperado|Entrada)/i);
    expect(messageOf(z.object({ a: z.string() }), {})).not.toMatch(/expected|Invalid input/);
    expect(messageOf(z.string().max(3, 'no puede superar 3'), 'abcd')).toBe('body: no puede superar 3');
  });

  it('sendZodError responde 400 con la ruta del campo y el mensaje, nada más', () => {
    const r = z.strictObject({ n: z.number() }).safeParse({ n: 'x', foo: 1 });
    if (r.success) throw new Error('debería fallar');
    const json = vi.fn();
    const res = { status: vi.fn(() => ({ json })) } as unknown as Parameters<typeof sendZodError>[0];
    sendZodError(res, r.error);
    expect(res.status).toHaveBeenCalledWith(400);
    const body = json.mock.calls[0][0] as { error: string };
    expect(body.error).toMatch(/^Datos inválidos: /);
    expect(body.error).toContain('n: ');
    expect(body.error).toContain('"foo"');
    expect(body.error).not.toMatch(/stack|at .*\.ts|ZodError/);
  });

  it('z.uuid() acepta los UUID v4 de la base de datos y rechaza el resto', () => {
    const id = z.uuid('id no válido');
    expect(id.safeParse('3b241101-e2bb-4255-8caf-4136c566a962').success).toBe(true);
    expect(id.safeParse('00000000-0000-0000-0000-000000000000').success).toBe(true); // nil: no existe, da 404
    expect(id.safeParse('00000000-0000-0000-0000-000000000001').success).toBe(false);
    expect(id.safeParse("x' OR 1=1 --").success).toBe(false);
  });

  it('una colección sobredimensionada se rechaza enseguida (GHSA-mrhx-c7xc-m3w5)', () => {
    const schema = z.array(z.number().min(-1e9).max(1e9)).min(1).max(200);
    const big = Array.from({ length: 200_000 }, () => 1);
    const t0 = Date.now();
    const r = schema.safeParse(big);
    expect(r.success).toBe(false);
    expect(Date.now() - t0).toBeLessThan(1000);
  });

  it('prefault: el valor por defecto pasa por la transformación (default no lo haría)', () => {
    const flag = z.enum(['true', 'false']).transform(v => v === 'true');
    expect(z.object({ g: flag.prefault('true') }).parse({})).toEqual({ g: true });
    expect(z.object({ g: flag.prefault('false') }).parse({})).toEqual({ g: false });
  });

  it('z.number() ya no admite infinitos (sustituye a .finite())', () => {
    expect(z.number().safeParse(Infinity).success).toBe(false);
  });
});
