import { describe, expect, it } from 'vitest';
import { buildHistoryOrderBy, buildHistoryWhere, escapeLike, hasFilters, historyExportSchema, historyQuerySchema, MAX_PAGE_SIZE } from './listFilters';

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

describe('orden y exportación (#349)', () => {
  it('sort y dir: por defecto fecha desc; solo valores de la lista blanca', () => {
    const r = parse({});
    expect(r.success && [r.data.sort, r.data.dir]).toEqual(['fecha', 'desc']);
    expect(parse({ sort: 'valor', dir: 'asc' }).success).toBe(true);
    expect(parse({ sort: 't.notes; DROP TABLE transactions' }).success).toBe(false);
    expect(parse({ dir: 'DESC' }).success).toBe(false);
  });

  it('la exportación acepta los mismos filtros pero no la paginación', () => {
    expect(historyExportSchema.safeParse({ asset: 'btc', sort: 'tipo' }).success).toBe(true);
    expect(historyExportSchema.safeParse({ limit: '10' }).success).toBe(false);
    expect(historyExportSchema.safeParse({ offset: '0' }).success).toBe(false);
  });

  it('hasFilters ignora orden y moneda', () => {
    expect(hasFilters(historyExportSchema.parse({ sort: 'valor', currency: 'USD' }))).toBe(false);
    expect(hasFilters(historyExportSchema.parse({ manually_added: 'false' }))).toBe(true);
  });

  it('ORDER BY con desempate estable y nulos al final al ordenar por valor', () => {
    expect(buildHistoryOrderBy('fecha', 'asc')).toBe('ORDER BY t.timestamp ASC, t.id ASC');
    for (const dir of ['asc', 'desc'] as const) {
      expect(buildHistoryOrderBy('valor', dir)).toMatch(/^ORDER BY \(t\.value_eur IS NULL\) ASC, t\.value_eur (ASC|DESC), t\.timestamp DESC, t\.id DESC$/);
    }
    expect(buildHistoryOrderBy('activo', 'asc')).toContain('t.id DESC');
  });
});
