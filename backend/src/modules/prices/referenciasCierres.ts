import { daysBetween, getCachedCloses, localDateOf, prefetchCloseRange } from './closePrices';

// Cierres diarios de las referencias de la evolución (#510): BTC y ETH (y
// USDT, el cambio a USD) se mantienen al día aunque no estén en cartera, para
// que «Comparar con» funcione al instante. Se comprueba al calcular el P&L
// diario (al abrir la app) y lo que falte se descarga en segundo plano, uno a
// la vez y con enfriamiento. No cuenta en la preparación de los históricos.

export const ACTIVOS_REFERENCIA = ['BTC', 'ETH', 'USDT'] as const;
const ENFRIAMIENTO_MS = 10 * 60_000;

let enCurso: Promise<void> | null = null;
let ultimo = 0;

/** Días de [fromDay, ayer] que faltan en la caché para cada referencia. */
export async function cierresQueFaltan(fromDay: string, tz: string, now = Date.now()): Promise<Map<string, string[]>> {
  const ayer = localDateOf(tz, now - 24 * 3_600_000);
  const out = new Map<string, string[]>();
  if (fromDay > ayer) return out;
  const cache = await getCachedCloses([...ACTIVOS_REFERENCIA], fromDay, ayer, tz);
  const dias = daysBetween(fromDay, ayer);
  for (const a of ACTIVOS_REFERENCIA) {
    const c = cache.get(a);
    const faltan = dias.filter(d => !c?.has(d));
    if (faltan.length > 0) out.set(a, faltan);
  }
  return out;
}

/** Lanza en segundo plano la descarga de lo que falte (no espera). */
export function asegurarCierresReferencia(fromDay: string, tz: string): void {
  if (enCurso || Date.now() - ultimo < ENFRIAMIENTO_MS) return;
  ultimo = Date.now();
  enCurso = (async () => {
    const faltan = await cierresQueFaltan(fromDay, tz);
    for (const [asset, dias] of faltan) {
      await prefetchCloseRange(asset, dias[0], dias[dias.length - 1], tz).catch(e =>
        console.error(`[PRECIOS] Cierres de la referencia ${asset} fallidos:`, (e as Error).message));
    }
  })().catch(e => console.error('[PRECIOS] Comprobación de referencias fallida:', (e as Error).message))
    .finally(() => { enCurso = null; });
}

/** Solo para tests: espera a la descarga en curso y reinicia el enfriamiento. */
export async function esperarReferencias(): Promise<void> {
  await (enCurso ?? Promise.resolve());
  ultimo = 0;
}
