// Mismo patrón que walletSync/providers/types.ts: centraliza fetch con
// timeout vía AbortController. Sin esto, una petición colgada bloquearía
// indefinidamente la cola serial de rate-limit (coingecko.ts) o el resto
// del flujo de precios (binance.ts) — ninguno de los fetch de este módulo
// tenía timeout hasta ahora, a diferencia de walletSync/providers/.
export const FETCH_TIMEOUT_MS = 10_000;

export async function fetchWithTimeout(url: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}
