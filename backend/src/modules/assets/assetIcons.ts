import { db } from '../../db/client';
import { BASE_URL, enqueueCoinGeckoCall, fetchWithRetry } from '../prices/coingeckoClient';
import { fetchWithTimeout } from '../prices/httpTimeout';
import { PRICE_ALIASES } from '../prices/priceAliases';
import { FIAT_ICON_SYMBOLS, FLAG_HOST, fiatFlagUrl } from './fiatFlags';
import { bestCoinGeckoMatch, isIconSymbol, isValidCoinGeckoId, localIcon } from './iconSources';

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
// - Las monedas fiat usan su bandera y los alias (BETH → ETH) el logo de su
//   activo de destino, sin descargarlo dos veces (#246).

export type IconContentType = 'image/png' | 'image/jpeg' | 'image/webp';

export const MAX_ICON_BYTES = 256 * 1024;
const ALLOWED_HOSTS = new Set(['coin-images.coingecko.com', 'assets.coingecko.com', FLAG_HOST]);
const MISSING_RETRY_DAYS = 7;
const MARKETS_BATCH = 100;

/** Tipo de imagen según la firma del contenido; null si no es PNG, JPEG ni WebP. */
export function sniffImageType(buf: Buffer): IconContentType | null {
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}

/** Solo URL HTTPS de los dominios de imágenes de CoinGecko y de banderas. */
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

type IconSource = 'coingecko' | 'local' | 'flag';

async function saveIcon(symbol: string, icon: { type: IconContentType; data: Buffer } | null, source: IconSource | null = null): Promise<void> {
  await db.query(
    `INSERT INTO asset_icons (symbol, status, content_type, data, fetched_at, source)
     VALUES ($1, $2, $3, $4, NOW(), $5)
     ON CONFLICT (symbol) DO UPDATE
       SET status = EXCLUDED.status, content_type = EXCLUDED.content_type,
           data = EXCLUDED.data, fetched_at = EXCLUDED.fetched_at, source = EXCLUDED.source`,
    [symbol, icon ? 'ok' : 'missing', icon?.type ?? null, icon?.data ?? null, icon ? source : null],
  );
}

/** PNG del paquete local con los mismos controles que un logo descargado (#449). */
function localPng(symbol: string): { type: IconContentType; data: Buffer } | null {
  const data = localIcon(symbol);
  if (!data || data.length === 0 || data.length > MAX_ICON_BYTES) return null;
  const type = sniffImageType(data);
  return type ? { type, data } : null;
}

/**
 * Id de CoinGecko para el logo de un símbolo, buscado por símbolo (#449).
 * Nunca toca coingecko_id. null si no hay coincidencia; undefined si falló la red.
 */
async function resolveIconId(symbol: string): Promise<string | null | undefined> {
  try {
    const data = await enqueueCoinGeckoCall(() => fetchWithRetry(`${BASE_URL}/search?query=${encodeURIComponent(symbol)}`)) as { coins?: unknown };
    return bestCoinGeckoMatch(data?.coins, symbol);
  } catch {
    return undefined;
  }
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

/** Activos y monedas que nunca tuvieron logo o llevan más de 7 días «sin logo». */
async function needsIcon(symbols: readonly string[]): Promise<string[]> {
  const rows = (await db.query(
    `SELECT s.symbol FROM unnest($1::text[]) AS s(symbol)
     LEFT JOIN asset_icons ai ON ai.symbol = s.symbol
     WHERE ai.symbol IS NULL OR (ai.status = 'missing' AND ai.fetched_at < NOW() - make_interval(days => $2))
     ORDER BY s.symbol`,
    [symbols, MISSING_RETRY_DAYS],
  )).rows as Array<{ symbol: string }>;
  return rows.map(r => r.symbol);
}

/** Logos de CoinGecko y banderas por separado: el fallo de una fuente no frena a la otra. */
async function runSync(): Promise<void> {
  const results = await Promise.allSettled([syncCoinGeckoIcons(), syncFiatFlags()]);
  for (const r of results) {
    if (r.status === 'rejected') console.warn('[ICONS] Sincronización de logos fallida:', (r.reason as Error).message);
  }
}

async function syncFiatFlags(): Promise<void> {
  for (const symbol of await needsIcon(FIAT_ICON_SYMBOLS)) {
    const url = fiatFlagUrl(symbol);
    let icon: { type: IconContentType; data: Buffer } | null = null;
    if (url) {
      try { icon = await downloadIcon(url); } catch { icon = null; }
    }
    await saveIcon(symbol, icon, 'flag');
  }
}

/**
 * Logos de los activos (#449), en este orden: CoinGecko (id manual del logo,
 * coingecko_id de precios o id del logo resuelto por símbolo), el paquete
 * local y, si nada, «sin logo» (el frontend pinta las iniciales). Los activos
 * sin ningún id se resuelven por símbolo una vez y se guardan como «auto».
 */
async function syncCoinGeckoIcons(): Promise<void> {
  const rows = (await db.query(
    `SELECT am.symbol, am.coingecko_id, am.icon_coingecko_id, am.icon_id_source
     FROM asset_metadata am
     LEFT JOIN asset_icons ai ON ai.symbol = am.symbol
     WHERE am.symbol <> ALL($2::text[])
       AND (ai.symbol IS NULL OR (ai.status = 'missing' AND ai.fetched_at < NOW() - make_interval(days => $1)))
     ORDER BY am.symbol`,
    [MISSING_RETRY_DAYS, FIAT_ICON_SYMBOLS],
  )).rows as Array<{ symbol: string; coingecko_id: string | null; icon_coingecko_id: string | null; icon_id_source: 'auto' | 'manual' | null }>;
  if (rows.length === 0) return;

  // El manual manda; después el de precios; después el resuelto por símbolo.
  // `offline`: sin respuesta de CoinGecko; sin logo local, no se marca y se reintenta pronto.
  const pending: Array<{ symbol: string; id: string | null; offline: boolean }> = [];
  for (const r of rows) {
    if (!isIconSymbol(r.symbol)) continue;
    let id = r.icon_id_source === 'manual' ? r.icon_coingecko_id : (r.coingecko_id ?? r.icon_coingecko_id);
    // Un alias sin id propio usa el logo de su destino (BETH → ETH): no se busca otro.
    if (!id && PRICE_ALIASES[r.symbol]) continue;
    let offline = false;
    if (!id) {
      const found = await resolveIconId(r.symbol);
      offline = found === undefined;
      id = found ?? null;
      if (id) {
        await db.query(
          `UPDATE asset_metadata SET icon_coingecko_id = $2, icon_id_source = 'auto'
           WHERE symbol = $1 AND icon_coingecko_id IS NULL`, [r.symbol, id]);
      }
    }
    pending.push({ symbol: r.symbol, id: isValidCoinGeckoId(id) ? id : null, offline });
  }

  const imageById = new Map<string, string>();
  const unreachable = new Set<string>();
  const ids = [...new Set(pending.map(p => p.id).filter((x): x is string => !!x))];
  for (let i = 0; i < ids.length; i += MARKETS_BATCH) {
    const batch = ids.slice(i, i + MARKETS_BATCH);
    const url = `${BASE_URL}/coins/markets?${new URLSearchParams({ vs_currency: 'eur', ids: batch.join(','), per_page: String(MARKETS_BATCH) })}`;
    try {
      const markets = await enqueueCoinGeckoCall(() => fetchWithRetry(url)) as Array<{ id?: unknown; image?: unknown }>;
      for (const m of Array.isArray(markets) ? markets : []) {
        if (typeof m.id === 'string' && typeof m.image === 'string') imageById.set(m.id, m.image);
      }
    } catch {
      // Sin red: se prueba el paquete local y, si no está, se reintenta en la próxima sincronización.
      batch.forEach(id => unreachable.add(id));
    }
  }

  for (const { symbol, id, offline } of pending) {
    const imageUrl = id ? imageById.get(id) : undefined;
    let icon: { type: IconContentType; data: Buffer } | null = null;
    if (imageUrl) {
      try { icon = await downloadIcon(imageUrl); } catch { icon = null; }
    }
    if (icon) { await saveIcon(symbol, icon, 'coingecko'); continue; }
    const local = localPng(symbol);
    if (local) { await saveIcon(symbol, local, 'local'); continue; }
    if (offline || (id !== null && unreachable.has(id))) continue;
    await saveIcon(symbol, null);
  }
}

/**
 * Añade a la lista los alias sin logo propio con la versión del logo de su
 * destino (BETH → ETH). Un logo propio del alias tiene prioridad.
 */
export function withAliasIcons(icons: Readonly<Record<string, number>>, aliases: Readonly<Record<string, string>> = PRICE_ALIASES): Record<string, number> {
  const out = { ...icons };
  for (const [alias, target] of Object.entries(aliases)) {
    if (out[alias] === undefined && icons[target] !== undefined) out[alias] = icons[target];
  }
  return out;
}

/** Activos con logo y una versión (instante de descarga en ms) para invalidar la caché del navegador. */
export async function listAssetIcons(): Promise<Record<string, number>> {
  const rows = (await db.query(
    `SELECT symbol, (EXTRACT(EPOCH FROM fetched_at) * 1000)::bigint AS version FROM asset_icons WHERE status = 'ok' ORDER BY symbol`,
  )).rows as Array<{ symbol: string; version: string }>;
  return withAliasIcons(Object.fromEntries(rows.map(r => [r.symbol, Number(r.version)])));
}

async function storedIcon(symbol: string): Promise<{ contentType: IconContentType; data: Buffer } | null> {
  const row = (await db.query(
    `SELECT content_type, data FROM asset_icons WHERE symbol = $1 AND status = 'ok'`, [symbol],
  )).rows[0] as { content_type: IconContentType; data: Buffer } | undefined;
  return row ? { contentType: row.content_type, data: row.data } : null;
}

/** Logo del activo o, si es un alias sin logo propio, el de su destino. */
export async function getAssetIcon(symbol: string): Promise<{ contentType: IconContentType; data: Buffer } | null> {
  const own = await storedIcon(symbol);
  if (own) return own;
  const target = PRICE_ALIASES[symbol];
  return target ? storedIcon(target) : null;
}
