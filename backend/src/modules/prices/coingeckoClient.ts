import { fetchWithTimeout } from './httpTimeout';

export const BASE_URL = process.env.COINGECKO_BASE_URL || 'https://api.coingecko.com/api/v3';
const API_KEY = process.env.COINGECKO_API_KEY || '';
// La cabecera depende del host, no es la misma para ambos planes (confirmado
// contra la doc oficial): x-cg-demo-api-key contra api.coingecko.com (plan
// gratuito), x-cg-pro-api-key solo contra pro-api.coingecko.com (plan de
// pago). Antes se enviaba siempre x-cg-pro-api-key — contra el host gratuito
// (el que usa esta app por defecto) esa cabecera se ignora en silencio, así
// que una API key gratuita configurada no tenía ningún efecto real.
const API_KEY_HEADER = BASE_URL.includes('pro-api.coingecko.com') ? 'x-cg-pro-api-key' : 'x-cg-demo-api-key';

// Callback opcional para surfacear eventos de precios (rate limiting, etc.) al caller.
let _statusCallback: ((msg: string) => void) | undefined;
export function setCoinGeckoStatusCallback(cb: ((msg: string) => void) | undefined): void {
  _statusCallback = cb;
}
export function notifyStatus(msg: string): void {
  _statusCallback?.(msg);
}

// ── Rate limiter simple ────────────────────────────────────────────────────
// CoinGecko free: 10-30 req/min. Usamos 6s entre llamadas = 10/min máximo.
class RateLimitedQueue {
  private queue: Array<() => Promise<unknown>> = [];
  private running = false;
  private readonly delayMs: number;

  constructor(delayMs = 6000) {
    this.delayMs = delayMs;
  }

  async enqueue<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push(async () => {
        try {
          resolve(await fn());
        } catch (e) {
          reject(e);
        }
      });
      this.process();
    });
  }

  private async process(): Promise<void> {
    if (this.running) return;
    this.running = true;
    while (this.queue.length > 0) {
      const fn = this.queue.shift()!;
      await fn();
      if (this.queue.length > 0) {
        await sleep(this.delayMs);
      }
    }
    this.running = false;
  }
}

// 6.5s entre llamadas, margen de seguridad. Configurable por env (por defecto igual)
// para permitir tests deterministas sin penalizar el rate limit real en producción.
const queue = new RateLimitedQueue(Number(process.env.COINGECKO_MIN_INTERVAL_MS ?? 6500));

export function enqueueCoinGeckoCall<T>(fn: () => Promise<T>): Promise<T> {
  return queue.enqueue(fn);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ── Rate limit compartido ────────────────────────────────────────────────
// Timestamp hasta el que sabemos que CoinGecko nos está limitando (último
// Retry-After recibido, de CUALQUIER llamada). Antes, cada símbolo pagaba su
// propia cascada completa de reintentos (hasta 3×60s) sin saber que ya
// sabíamos que seguíamos limitados — un import con varios símbolos sin
// caché podía bloquearse muchos minutos. Ahora, un intento que empieza
// dentro de la ventana ya conocida falla rápido en vez de repetir la espera.
let rateLimitedUntil = 0;

// ── Fetch con retry ────────────────────────────────────────────────────────
// retries=2 (antes 3): con el límite gratuito, 2 intentos ya cubren un fallo
// puntual; un tercero solo alargaba la espera sin cambiar el desenlace.
export async function fetchWithRetry(url: string, retries = 2): Promise<unknown> {
  if (Date.now() < rateLimitedUntil) {
    const waitSec = Math.round((rateLimitedUntil - Date.now()) / 1000);
    throw new Error(`CoinGecko sigue en rate limit (${waitSec}s restantes de una espera ya conocida) — se reintentará en la próxima sesión`);
  }

  const headers: Record<string, string> = {
    'Accept': 'application/json',
  };
  if (API_KEY) {
    headers[API_KEY_HEADER] = API_KEY;
  }

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetchWithTimeout(url, { headers });

      if (res.status === 429) {
        // Respetar Retry-After si CoinGecko lo envía, si no usar backoff progresivo
        const retryAfter = parseInt(res.headers.get('retry-after') ?? '0', 10);
        const waitMs = retryAfter > 0 ? retryAfter * 1000 : attempt * 15000;
        const waitSec = Math.round(waitMs / 1000);
        rateLimitedUntil = Date.now() + waitMs;
        console.warn(`[PRICES] Rate limit (429), esperando ${waitSec}s...`);
        notifyStatus(`⏳ Rate limit CoinGecko 429 — esperando ${waitSec}s (intento ${attempt}/${retries})...`);
        await sleep(waitMs);
        continue;
      }

      if (!res.ok) {
        throw new Error(`HTTP ${res.status} para ${url}`);
      }

      return await res.json();
    } catch (e) {
      if (attempt === retries) throw e;
      await sleep(3000 * attempt);
    }
  }
  throw new Error(`fetchWithRetry agotó reintentos para ${url}`);
}
