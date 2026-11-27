import { afterEach, describe, expect, it } from 'vitest';
import { cabecerasCoinGecko, coinGeckoBaseUrl, configurarCoinGecko } from './coingeckoClient';

// Configuración en caliente de CoinGecko (versión 1.0): la clave de Ajustes
// manda sobre la del entorno, y COINGECKO_BASE_URL solo cuenta si no es un
// servidor oficial (los compose la fijan siempre a la URL gratuita).
const ENV = { ...process.env };
afterEach(() => {
  process.env = { ...ENV };
  configurarCoinGecko(null);
});

describe('coinGeckoBaseUrl y cabeceras', () => {
  it('sin clave usa el servidor gratuito aunque el compose fije su URL', () => {
    process.env.COINGECKO_BASE_URL = 'https://api.coingecko.com/api/v3';
    expect(coinGeckoBaseUrl()).toBe('https://api.coingecko.com/api/v3');
  });

  it('la clave Pro de Ajustes cambia a pro-api aunque el entorno diga la gratuita', () => {
    process.env.COINGECKO_BASE_URL = 'https://api.coingecko.com/api/v3';
    configurarCoinGecko({ clave: 'k', plan: 'pro' });
    expect(coinGeckoBaseUrl()).toBe('https://pro-api.coingecko.com/api/v3');
  });

  it('una URL propia del entorno (proxy o pruebas) manda siempre', () => {
    process.env.COINGECKO_BASE_URL = 'http://proxy.local/api/v3';
    configurarCoinGecko({ clave: 'k', plan: 'pro' });
    expect(coinGeckoBaseUrl()).toBe('http://proxy.local/api/v3');
  });

  it('sin clave guardada, el plan sale de la URL del entorno', () => {
    process.env.COINGECKO_BASE_URL = 'https://pro-api.coingecko.com/api/v3';
    expect(coinGeckoBaseUrl()).toBe('https://pro-api.coingecko.com/api/v3');
  });

  it('cabecera según el plan, y ninguna sin clave', () => {
    expect(cabecerasCoinGecko('k', 'demo')).toEqual({ 'x-cg-demo-api-key': 'k' });
    expect(cabecerasCoinGecko('k', 'pro')).toEqual({ 'x-cg-pro-api-key': 'k' });
    expect(cabecerasCoinGecko('', 'pro')).toEqual({});
  });
});
