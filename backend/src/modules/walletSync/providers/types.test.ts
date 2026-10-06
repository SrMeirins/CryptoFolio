import { describe, expect, it, vi, afterEach } from 'vitest';
import { fetchJson } from './types';

describe('fetchJson', () => {
  afterEach(() => vi.restoreAllMocks());

  it('devuelve ok:true con el payload parseado si la petición HTTP es exitosa', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ foo: 'bar' }) }) as unknown as Response));
    const result = await fetchJson<{ foo: string }>('https://example.com', 'TestService');
    expect(result).toEqual({ ok: true, data: { foo: 'bar' } });
  });

  it('devuelve ok:false con el servicio y el status si la respuesta HTTP no es 2xx', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}) }) as unknown as Response));
    const result = await fetchJson('https://example.com', 'TestService');
    expect(result).toEqual({ ok: false, error: 'TestService respondió 503' });
  });

  it('devuelve ok:false si la petición lanza (timeout/red)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network error'); }));
    const result = await fetchJson('https://example.com', 'TestService');
    expect(result).toEqual({ ok: false, error: 'network error' });
  });
});
