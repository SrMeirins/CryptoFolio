import { beforeEach, describe, expect, it, vi } from 'vitest';

// Clasificación de la comprobación (versión 1.0), con las respuestas reales
// observadas al probar cada API con una clave inválida. Sin red: fetch simulado.
const { fetchMock } = vi.hoisted(() => ({ fetchMock: vi.fn() }));
vi.mock('../walletSync/providers/types', () => ({ fetchWithTimeout: fetchMock }));

import { comprobarClave } from './comprobar';

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('comprobarClave', () => {
  beforeEach(() => fetchMock.mockReset());

  it('Etherscan: status 1 acepta, «Invalid API Key» rechaza, otro NOTOK no responde', async () => {
    fetchMock.mockResolvedValueOnce(json(200, { status: '1', result: '0' }));
    expect(await comprobarClave('etherscan', 'k')).toBe('aceptada');
    fetchMock.mockResolvedValueOnce(json(200, { status: '0', message: 'NOTOK', result: 'Invalid API Key (#err2)' }));
    expect(await comprobarClave('etherscan', 'k')).toBe('rechazada');
    fetchMock.mockResolvedValueOnce(json(200, { status: '0', message: 'NOTOK', result: 'Max rate limit reached' }));
    expect(await comprobarClave('etherscan', 'k')).toBe('sin_respuesta');
  });

  it('Blockfrost, PubFi y CoinGecko: 2xx acepta, 401/403 rechaza, 429 o 5xx no responde', async () => {
    for (const servicio of ['blockfrost', 'subscan', 'coingecko'] as const) {
      fetchMock.mockResolvedValueOnce(json(200, {}));
      expect(await comprobarClave(servicio, 'k')).toBe('aceptada');
      fetchMock.mockResolvedValueOnce(json(servicio === 'blockfrost' ? 403 : 401, { error: 'x' }));
      expect(await comprobarClave(servicio, 'k')).toBe('rechazada');
      fetchMock.mockResolvedValueOnce(json(429, {}));
      expect(await comprobarClave(servicio, 'k')).toBe('sin_respuesta');
      fetchMock.mockResolvedValueOnce(json(503, {}));
      expect(await comprobarClave(servicio, 'k')).toBe('sin_respuesta');
    }
  });

  it('un fallo de red cuenta como «sin respuesta», no como rechazo', async () => {
    fetchMock.mockRejectedValueOnce(new Error('ECONNRESET'));
    expect(await comprobarClave('blockfrost', 'k')).toBe('sin_respuesta');
  });

  it('CoinGecko prueba /ping en el servidor y con la cabecera de su plan', async () => {
    fetchMock.mockResolvedValue(json(200, {}));
    await comprobarClave('coingecko', 'k', 'pro');
    expect(fetchMock.mock.calls[0][0]).toBe('https://pro-api.coingecko.com/api/v3/ping');
    expect(fetchMock.mock.calls[0][1].headers).toMatchObject({ 'x-cg-pro-api-key': 'k' });
    await comprobarClave('coingecko', 'k', 'demo');
    expect(fetchMock.mock.calls[1][0]).toBe('https://api.coingecko.com/api/v3/ping');
    expect(fetchMock.mock.calls[1][1].headers).toMatchObject({ 'x-cg-demo-api-key': 'k' });
  });

  it('la clave de Etherscan va codificada en la URL', async () => {
    fetchMock.mockResolvedValue(json(200, { status: '1' }));
    await comprobarClave('etherscan', 'a&b=c');
    expect(fetchMock.mock.calls[0][0]).toContain('apikey=a%26b%3Dc');
  });
});
