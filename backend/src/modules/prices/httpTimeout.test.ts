import { describe, expect, it, vi, afterEach } from 'vitest';
import { fetchWithTimeout } from './httpTimeout';

describe('fetchWithTimeout', () => {
  afterEach(() => vi.restoreAllMocks());

  it('devuelve la respuesta normalmente si fetch resuelve antes del timeout', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200 }) as unknown as Response));
    const res = await fetchWithTimeout('https://example.com');
    expect(res.ok).toBe(true);
  });

  it('propaga las opciones (headers, method, body) a fetch', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200 }) as unknown as Response);
    vi.stubGlobal('fetch', fetchMock);
    await fetchWithTimeout('https://example.com', { method: 'POST', headers: { 'X-Test': '1' } });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://example.com',
      expect.objectContaining({ method: 'POST', headers: { 'X-Test': '1' }, signal: expect.anything() })
    );
  });

  it('aborta la petición si tarda más que FETCH_TIMEOUT_MS', async () => {
    vi.useFakeTimers();
    try {
      vi.stubGlobal('fetch', vi.fn((_url: string, init?: RequestInit) => new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('The operation was aborted')));
      })));

      const promise = fetchWithTimeout('https://example.com');
      const assertion = expect(promise).rejects.toThrow('aborted');
      await vi.advanceTimersByTimeAsync(10_000);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });
});
