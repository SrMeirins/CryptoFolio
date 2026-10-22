import { afterEach } from 'vitest';

// Guardia de red de los tests (#359), cargada como setupFile en vitest.config.ts.
// Ningún test puede salir a internet: las APIs de precios reales hacían la CI
// lenta (la mitad del tiempo de la suite) e intermitente (rate limits).
//
// Un fetch a un host no local se rechaza al instante y, además, el test falla
// en afterEach: el código de precios captura sus errores, así que sin este
// registro la llamada pasaría desapercibida. Para probar una API, simúlala con
// vi.stubGlobal('fetch', …) o vi.spyOn(globalThis, 'fetch'); para probar sin
// precios externos, vi.stubEnv('PRICE_SOURCES_OFFLINE', 'true').

const LOCAL = /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?(\/|$)/;
const blocked: string[] = [];
const realFetch = globalThis.fetch;

export function urlOf(input: string | URL | Request): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = urlOf(input);
  if (!LOCAL.test(url)) {
    let host = url;
    try { host = new URL(url).host; } catch { /* URL relativa o inválida: se informa tal cual */ }
    blocked.push(host);
    throw new Error(`red bloqueada en test: simula ${host}`);
  }
  return realFetch(input, init);
}) as typeof fetch;

/** Hosts bloqueados desde la última consulta (y vacía el registro). */
export function takeBlockedHosts(): string[] {
  const hosts = [...new Set(blocked)];
  blocked.length = 0;
  return hosts;
}

afterEach(() => {
  const hosts = takeBlockedHosts().join(', ');
  if (!hosts) return;
  throw new Error(`El test intentó salir a internet (${hosts}). Simula la API o usa vi.stubEnv('PRICE_SOURCES_OFFLINE', 'true').`);
});
