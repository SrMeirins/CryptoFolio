import { fetchWithTimeout } from './httpTimeout';

// Configuración en caliente (versión 1.0): la clave puede venir de Ajustes,
// Conexiones (guardada cifrada en claves_servicio) o del entorno
// (COINGECKO_API_KEY, Docker). La de Ajustes manda; sin ninguna, acceso anónimo.
// La cabecera depende del servidor, no es la misma para ambos planes (doc
// oficial): x-cg-demo-api-key contra api.coingecko.com (plan gratuito) y
// x-cg-pro-api-key solo contra pro-api.coingecko.com (plan de pago).
export type PlanCoinGecko = 'demo' | 'pro';
const URL_DEMO = 'https://api.coingecko.com/api/v3';
const URL_PRO = 'https://pro-api.coingecko.com/api/v3';

interface ConfigCoinGecko { clave: string; plan: PlanCoinGecko }
const planDelEntorno = (): PlanCoinGecko => (process.env.COINGECKO_BASE_URL?.includes('pro-api.coingecko.com') ? 'pro' : 'demo');
const delEntorno = (): ConfigCoinGecko => ({ clave: process.env.COINGECKO_API_KEY || '', plan: planDelEntorno() });
let guardada: ConfigCoinGecko | null = null;

/** Fija la clave guardada en Ajustes (null: se vuelve a la del entorno, si la hay). */
export function configurarCoinGecko(config: ConfigCoinGecko | null): void {
  guardada = config && config.clave ? config : null;
}

function configActual(): ConfigCoinGecko {
  return guardada ?? delEntorno();
}

/**
 * Servidor de la API: el del plan. COINGECKO_BASE_URL solo manda si apunta a
 * otro servidor (un proxy o un entorno de pruebas): los compose la fijan
 * siempre a la URL gratuita y, si mandara, el plan Pro de Ajustes no tendría
 * efecto.
 */
export function coinGeckoBaseUrl(plan: PlanCoinGecko = configActual().plan): string {
  const delEnv = process.env.COINGECKO_BASE_URL;
  if (delEnv && !/^https:\/\/(pro-)?api\.coingecko\.com\//.test(delEnv)) return delEnv;
  return plan === 'pro' ? URL_PRO : URL_DEMO;
}

/** Cabeceras de autenticación para una clave y un plan (vacías sin clave). */
export function cabecerasCoinGecko(clave: string, plan: PlanCoinGecko): Record<string, string> {
  if (!clave) return {};
  return { [coinGeckoBaseUrl(plan).includes('pro-api.coingecko.com') ? 'x-cg-pro-api-key' : 'x-cg-demo-api-key']: clave };
}

// Callback opcional para surfacear eventos de precios (rate limiting, etc.) al caller.
// `info.esperaSeg` (#324): duración de una espera por rate limit, para la cuenta atrás del cliente.
export interface InfoEstado { esperaSeg?: number }
let _statusCallback: ((msg: string, info?: InfoEstado) => void) | undefined;
export function setCoinGeckoStatusCallback(cb: ((msg: string, info?: InfoEstado) => void) | undefined): void {
  _statusCallback = cb;
}
export function notifyStatus(msg: string, info?: InfoEstado): void {
  _statusCallback?.(msg, info);
}

// ── Rate limiter simple ────────────────────────────────────────────────────
// CoinGecko free: 10-30 req/min. Usamos 6s entre llamadas = 10/min máximo.
class RateLimitedQueue {
  private queue: Array<() => Promise<unknown>> = [];
  private running = false;
  private readonly delayMs: () => number;

  constructor(delayMs: () => number) {
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
        await sleep(this.delayMs());
      }
    }
    this.running = false;
  }
}

// Intervalo entre llamadas, con margen: sin clave el límite anónimo es de unas
// 10 por minuto (6,5 s); con una clave Demo, 30 por minuto (2,1 s). Se evalúa
// en cada espera, así que una clave nueva acelera la cola al momento.
// COINGECKO_MIN_INTERVAL_MS lo fija (tests deterministas).
const queue = new RateLimitedQueue(() => {
  const fijo = process.env.COINGECKO_MIN_INTERVAL_MS;
  if (fijo !== undefined) return Number(fijo);
  return configActual().clave ? 2100 : 6500;
});

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

  const { clave, plan } = configActual();
  const headers: Record<string, string> = { 'Accept': 'application/json', ...cabecerasCoinGecko(clave, plan) };

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
        notifyStatus(`⏳ Rate limit CoinGecko 429 — esperando ${waitSec}s (intento ${attempt}/${retries})...`, { esperaSeg: waitSec });
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
