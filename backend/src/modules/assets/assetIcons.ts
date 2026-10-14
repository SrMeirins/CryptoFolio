import { db } from '../../db/client';
import { BASE_URL, enqueueCoinGeckoCall, fetchWithRetry } from '../prices/coingeckoClient';
import { fetchWithTimeout } from '../prices/httpTimeout';

// Logos de los activos servidos desde el propio origen (#201). Antes el
// navegador los pedía a un servicio externo, lo que revelaba qué activos se
// tienen y no funcionaba con la CSP de producción (img-src 'self' data:).
//
// El backend obtiene la URL de cada logo con una sola llamada a CoinGecko
// (que ya conoce esos activos por los precios), descarga cada imagen una vez
// y la guarda en asset_icons. Controles:
// - Solo HTTPS y dominios de imágenes de CoinGecko (evita SSRF).
// - Tamaño máximo y tipo comprobado por la firma real del fichero; solo PNG,
//   JPEG o WebP (SVG no: puede contener scripts).
// - Los activos sin logo quedan marcados y se reintentan pasados 7 días.

export type IconContentType = 'image/png' | 'image/jpeg' | 'image/webp';

export const MAX_ICON_BYTES = 256 * 1024;
const ALLOWED_HOSTS = new Set(['coin-images.coingecko.com', 'assets.coingecko.com']);
const MISSING_RETRY_DAYS = 7;
const MARKETS_BATCH = 100;

/** Tipo de imagen según la firma del contenido; null si no es PNG, JPEG ni WebP. */
export function sniffImageType(buf: Buffer): IconContentType | null {
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}

/** Solo URL HTTPS de los dominios de imágenes de CoinGecko. */
export function isAllowedIconUrl(raw: string): boolean {
  let url: URL;
  try { url = new URL(raw); } catch { return false; }
  return url.protocol === 'https:' && url.username === '' && url.password === '' && ALLOWED_HOSTS.has(url.hostname);
}

async function downloadIcon(url: string): Promise<{ type: IconContentType; data: Buffer } | null> {
  if (!isAllowedIconUrl(url)) return null;
  const res = await fetchWithTimeout(url, { redirect: 'error' });
  if (!res.ok) return null;
  const declared = Number(res.headers.get('content-length') ?? 0);
  if (declared > MAX_ICON_BYTES) return null;
  const data = Buffer.from(await res.arrayBuffer());
  if (data.length === 0 || data.length > MAX_ICON_BYTES) return null;
  const type = sniffImageType(data);
  return type ? { type, data } : null;
}

async function saveIcon(symbol: string, icon: { type: IconContentType; data: Buffer } | null): Promise<void> {
  await db.query(
    `INSERT INTO asset_icons (symbol, status, content_type, data, fetched_at)
     VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT (symbol) DO UPDATE
       SET status = EXCLUDED.status, content_type = EXCLUDED.content_type,
           data = EXCLUDED.data, fetched_at = EXCLUDED.fetched_at`,
    [symbol, icon ? 'ok' : 'missing', icon?.type ?? null, icon?.data ?? null],
  );
}

let syncInFlight: Promise<void> | null = null;
let lastSyncAt = 0;
const SYNC_COOLDOWN_MS = 10 * 60_000;

/**
 * Descarga los logos que faltan (activos con coingecko_id sin logo guardado,
 * o marcados «sin logo» hace más de 7 días). Nunca lanza: los fallos se
 * registran y se reintentan en la siguiente sincronización. Sin `force`,
 * respeta un enfriamiento para no repetirse en cada petición.
 */
export function syncAssetIcons({ force = false }: { force?: boolean } = {}): Promise<void> {
  if (syncInFlight) return syncInFlight;
  if (!force && Date.now() - lastSyncAt < SYNC_COOLDOWN_MS) return Promise.resolve();
  lastSyncAt = Date.now();
  syncInFlight = runSync()
    .catch(e => console.warn('[ICONS] Sincronización de logos fallida:', (e as Error).message))
    .finally(() => { syncInFlight = null; });
  return syncInFlight;
}

async function runSync(): Promise<void> {
  const pending = (await db.query(
    `SELECT am.symbol, am.coingecko_id
     FROM asset_metadata am
     LEFT JOIN asset_icons ai ON ai.symbol = am.symbol
     WHERE am.coingecko_id IS NOT NULL
       AND (ai.symbol IS NULL OR (ai.status = 'missing' AND ai.fetched_at < NOW() - make_interval(days => $1)))
     ORDER BY am.symbol`,
    [MISSING_RETRY_DAYS],
  )).rows as Array<{ symbol: string; coingecko_id: string }>;
  if (pending.length === 0) return;

  for (let i = 0; i < pending.length; i += MARKETS_BATCH) {
    const batch = pending.slice(i, i + MARKETS_BATCH);
    const ids = [...new Set(batch.map(p => p.coingecko_id))];
    const url = `${BASE_URL}/coins/markets?${new URLSearchParams({ vs_currency: 'eur', ids: ids.join(','), per_page: String(MARKETS_BATCH) })}`;
    const markets = await enqueueCoinGeckoCall(() => fetchWithRetry(url)) as Array<{ id?: unknown; image?: unknown }>;
    const imageById = new Map<string, string>();
    for (const m of Array.isArray(markets) ? markets : []) {
      if (typeof m.id === 'string' && typeof m.image === 'string') imageById.set(m.id, m.image);
    }
    for (const { symbol, coingecko_id } of batch) {
      const imageUrl = imageById.get(coingecko_id);
      let icon: { type: IconContentType; data: Buffer } | null = null;
      if (imageUrl) {
        try { icon = await downloadIcon(imageUrl); } catch { icon = null; }
      }
      await saveIcon(symbol, icon);
    }
  }
}

/** Activos con logo y una versión (instante de descarga en ms) para invalidar la caché del navegador. */
export async function listAssetIcons(): Promise<Record<string, number>> {
  const rows = (await db.query(
    `SELECT symbol, (EXTRACT(EPOCH FROM fetched_at) * 1000)::bigint AS version FROM asset_icons WHERE status = 'ok' ORDER BY symbol`,
  )).rows as Array<{ symbol: string; version: string }>;
  return Object.fromEntries(rows.map(r => [r.symbol, Number(r.version)]));
}

export async function getAssetIcon(symbol: string): Promise<{ contentType: IconContentType; data: Buffer } | null> {
  const row = (await db.query(
    `SELECT content_type, data FROM asset_icons WHERE symbol = $1 AND status = 'ok'`, [symbol],
  )).rows[0] as { content_type: IconContentType; data: Buffer } | undefined;
  return row ? { contentType: row.content_type, data: row.data } : null;
}
