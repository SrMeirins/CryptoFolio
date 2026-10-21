import { describe, expect, it } from 'vitest';
import { buildHistoryWhere, escapeLike, historyQuerySchema, MAX_PAGE_SIZE } from './listFilters';

// Validación de los filtros de GET /transactions (#346).
const parse = (q: Record<string, unknown>) => historyQuerySchema.safeParse(q);

describe('historyQuerySchema', () => {
  it('aplica los valores por defecto y convierte limit/offset a número', () => {
    const r = parse({});
    expect(r.success && r.data).toMatchObject({ limit: 50, offset: 0, currency: 'EUR' });
  });

  it(`rechaza limit fuera de 1–${MAX_PAGE_SIZE} y valores no numéricos`, () => {
    for (const limit of ['0', String(MAX_PAGE_SIZE + 1), 'abc', '-1', '1.5']) {
      expect(parse({ limit }).success, limit).toBe(false);
    }
    expect(parse({ limit: String(MAX_PAGE_SIZE) }).success).toBe(true);
  });

  it('rechaza ids que no son UUID', () => {
    expect(parse({ wallet_id: "x' OR 1=1 --" }).success).toBe(false);
    expect(parse({ import_id: 'abc' }).success).toBe(false);
    expect(parse({ wallet_id: '7f3a1c2e-1b2c-4d5e-8f90-123456789abc' }).success).toBe(true);
  });

  it('solo acepta tipos del enum operation_type', () => {
    expect(parse({ type: 'BUY' }).success).toBe(true);
    expect(parse({ type: "BUY' OR '1'='1" }).success).toBe(false);
  });

  it('valida las fechas como días de calendario y su orden', () => {
    expect(parse({ date_from: '2026-02-30' }).success).toBe(false);
    expect(parse({ date_from: '2026/02/01' }).success).toBe(false);
    expect(parse({ date_from: '2026-05-01', date_to: '2026-04-01' }).success).toBe(false);
    expect(parse({ date_from: '2026-04-01', date_to: '2026-04-01' }).success).toBe(true);
  });

  it('rechaza parámetros repetidos (arrays) y desconocidos', () => {
    expect(parse({ type: ['BUY', 'SELL'] }).success).toBe(false);
    expect(parse({ foo: '1' }).success).toBe(false);
  });

  it('normaliza el activo a mayúsculas y rechaza caracteres no permitidos', () => {
    const r = parse({ asset: 'btc' });
    expect(r.success && r.data.asset).toBe('BTC');
    expect(parse({ asset: "BTC'--" }).success).toBe(false);
  });

  it('manually_added solo admite true/false', () => {
    const r = parse({ manually_added: 'false' });
    expect(r.success && r.data.manually_added).toBe(false);
    expect(parse({ manually_added: 'yes' }).success).toBe(false);
  });

  it('limita la longitud de la búsqueda', () => {
    expect(parse({ search: 'a'.repeat(101) }).success).toBe(false);
  });
});

describe('escapeLike', () => {
  it('escapa los comodines y la barra invertida', () => {
    expect(escapeLike('50%_a\\b')).toBe('50\\%\\_a\\\\b');
  });
});

describe('buildHistoryWhere', () => {
  const base = historyQuerySchema.parse({});

  it('sin filtros no genera WHERE', () => {
    expect(buildHistoryWhere(base, 'Europe/Madrid')).toEqual({ where: '', params: [] });
  });

  it('parametriza cada filtro y nunca interpola valores', () => {
    const f = historyQuerySchema.parse({ asset: 'eth', search: '50%', date_from: '2026-01-01', date_to: '2026-01-31' });
    const { where, params } = buildHistoryWhere(f, 'Europe/Madrid');
    expect(where).not.toContain('ETH');
    expect(where).not.toContain('50');
    expect(params).toEqual(['ETH', 'Europe/Madrid', '2026-01-01', '2026-01-31', '%50\\%%']);
    expect(where).toContain("ESCAPE '\\'");
  });

  it('el rango de fechas incluye días locales enteros en la zona dada', () => {
    const f = historyQuerySchema.parse({ date_to: '2026-01-31' });
    const { where } = buildHistoryWhere(f, 'Atlantic/Canary');
    expect(where).toBe('WHERE t.timestamp < ($2::date + 1)::timestamp AT TIME ZONE $1');
  });
});
