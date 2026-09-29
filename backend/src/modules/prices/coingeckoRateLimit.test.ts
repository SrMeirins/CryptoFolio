import { describe, expect, it, vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { createTestDatabase, TestDatabase } from '../../test/setup-test-db';

// getCurrentPricesEur toca price_cache de verdad (INSERT tras cada precio
// resuelto) — necesita una base de datos real con el esquema cargado, igual
// que el resto de tests de este módulo. Una única BBDD de test para todo el
// fichero (no una por test): solo variamos COINGECKO_BASE_URL/API_KEY.
let testDb: TestDatabase;

beforeAll(async () => {
  testDb = await createTestDatabase();
  process.env.DATABASE_URL = testDb.connectionString;
}, 30000);

afterAll(async () => {
  if (testDb) await testDb.teardown();
});

// BASE_URL y la cabecera de API key se leen de env al cargar el módulo —
// cada test necesita una instancia fresca (vi.resetModules + import dinámico
// DESPUÉS de fijar el env) para poder variar el escenario.
async function loadCoingeckoWithEnv(baseUrl: string, apiKey: string) {
  vi.resetModules();
  process.env.COINGECKO_BASE_URL = baseUrl;
  process.env.COINGECKO_API_KEY = apiKey;
  const mod = await import('./coingecko');
  await mod.loadAssetMetadata();
  return mod;
}

describe('coingecko — cabecera de API key según el host (regresión 2026-09-29)', () => {
  const origBaseUrl = process.env.COINGECKO_BASE_URL;
  const origApiKey = process.env.COINGECKO_API_KEY;

  afterEach(() => {
    vi.restoreAllMocks();
    process.env.COINGECKO_BASE_URL = origBaseUrl;
    process.env.COINGECKO_API_KEY = origApiKey;
  });

  // Antes del fix: siempre x-cg-pro-api-key, aunque el host fuera el gratuito
  // (api.coingecko.com) — esa cabecera se ignora ahí, así que una API key
  // Demo configurada por el usuario no tenía ningún efecto real.
  it('usa x-cg-demo-api-key contra el host gratuito (api.coingecko.com)', async () => {
    let receivedHeaders: Record<string, string> | undefined;
    vi.stubGlobal('fetch', vi.fn(async (_url: string, opts: { headers: Record<string, string> }) => {
      receivedHeaders = opts.headers;
      return {
        ok: true, status: 200, headers: new Headers(),
        json: async () => ({ bitcoin: { eur: 50000 } }),
      } as unknown as Response;
    }));

    const { getCurrentPricesEur } = await loadCoingeckoWithEnv('https://api.coingecko.com/api/v3', 'mi-key-demo');
    await getCurrentPricesEur(['BTC']);

    expect(receivedHeaders?.['x-cg-demo-api-key']).toBe('mi-key-demo');
    expect(receivedHeaders?.['x-cg-pro-api-key']).toBeUndefined();
  });

  it('usa x-cg-pro-api-key contra el host de pago (pro-api.coingecko.com)', async () => {
    let receivedHeaders: Record<string, string> | undefined;
    vi.stubGlobal('fetch', vi.fn(async (_url: string, opts: { headers: Record<string, string> }) => {
      receivedHeaders = opts.headers;
      return {
        ok: true, status: 200, headers: new Headers(),
        json: async () => ({ bitcoin: { eur: 50000 } }),
      } as unknown as Response;
    }));

    const { getCurrentPricesEur } = await loadCoingeckoWithEnv('https://pro-api.coingecko.com/api/v3', 'mi-key-pro');
    await getCurrentPricesEur(['BTC']);

    expect(receivedHeaders?.['x-cg-pro-api-key']).toBe('mi-key-pro');
    expect(receivedHeaders?.['x-cg-demo-api-key']).toBeUndefined();
  });
});

describe('coingecko — rate limit compartido evita repetir la cascada completa (regresión 2026-09-29)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('una segunda llamada dentro de la ventana de rate limit ya conocida falla rápido, sin llamar a fetch otra vez', async () => {
    let fetchCalls = 0;
    vi.stubGlobal('fetch', vi.fn(async () => {
      fetchCalls++;
      return {
        ok: false, status: 429,
        headers: new Headers({ 'retry-after': '60' }),
        json: async () => ({}),
      } as unknown as Response;
    }));

    const { getCurrentPricesEur } = await loadCoingeckoWithEnv('https://api.coingecko.com/api/v3', '');

    // Primera llamada: deja que agote su propia cascada de reintentos (2
    // intentos × 60s de espera) — el último 429 deja rateLimitedUntil
    // fijado justo en el instante en que esta llamada termina.
    const firstCall = getCurrentPricesEur(['BTC']);
    await vi.advanceTimersByTimeAsync(120_000);
    await firstCall;
    expect(fetchCalls).toBe(2);

    // La cola es estrictamente secuencial (una llamada a la vez), así que en
    // producción la siguiente ya empieza justo cuando termina la anterior —
    // aquí retrocedemos el reloj 30s para simular ese mismo instante sin
    // depender de un empate exacto de milisegundos con el temporizador.
    vi.setSystemTime(new Date(Date.now() - 30_000));

    // Dentro de la ventana ya conocida: debe fallar rápido (sin tocar la
    // red) en vez de repetir su propia cascada de reintentos de 429.
    await getCurrentPricesEur(['ETH']);
    expect(fetchCalls).toBe(2); // ningún fetch nuevo para ETH
  });
});
