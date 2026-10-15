import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { Pool } from 'pg';
import { createTestDatabase, TestDatabase } from '../../test/setup-test-db';

// Logos servidos desde el propio origen (#201), sin red real: la llamada a
// CoinGecko y la descarga de cada imagen se simulan.
const { marketsMock } = vi.hoisted(() => ({ marketsMock: vi.fn() }));
vi.mock('../prices/coingeckoClient', () => ({
  BASE_URL: 'https://api.coingecko.test/api/v3',
  enqueueCoinGeckoCall: (fn: () => Promise<unknown>) => fn(),
  fetchWithRetry: marketsMock,
}));

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32)]);
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(32)]);
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.from([0, 0, 0, 0]), Buffer.from('WEBP'), Buffer.alloc(32)]);
const CRYPTO = `symbol IN ('BTC', 'ETH', 'XRP')`;
const OK_URL = (id: string) => `https://coin-images.coingecko.com/coins/images/1/large/${id}.png`;

let testDb: TestDatabase;
let pool: Pool;
let icons: typeof import('./assetIcons');
let app: import('express').Express;
let downloads: Record<string, Buffer | 'html' | 'big'>;

function imageResponse(body: Buffer | 'html' | 'big'): Response {
  if (body === 'html') return new Response('<html>404</html>', { status: 404, headers: { 'content-type': 'text/html' } });
  if (body === 'big') return new Response(Buffer.alloc(300_000), { status: 200, headers: { 'content-type': 'image/png', 'content-length': '300000' } });
  return new Response(body, { status: 200, headers: { 'content-type': 'image/png' } });
}

describe('assetIcons (#201)', () => {
  beforeAll(async () => {
    testDb = await createTestDatabase();
    process.env.DATABASE_URL = testDb.connectionString;
    pool = new Pool({ connectionString: testDb.connectionString });
    icons = await import('./assetIcons');
    const { default: router } = await import('../../routes/assetIcons');
    const express = (await import('express')).default;
    app = express();
    app.use('/api/assets', router);
  });

  afterAll(async () => {
    await pool.end();
    if (testDb) await testDb.teardown();
  });

  beforeEach(async () => {
    await pool.query('DELETE FROM asset_icons');
    await pool.query(`DELETE FROM asset_metadata WHERE symbol NOT IN ('BTC', 'ETH', 'XRP')`);
    downloads = {};
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      const id = String(url).split('/').pop()!.replace('.png', '');
      return imageResponse(downloads[id] ?? 'html');
    }));
    marketsMock.mockReset();
    marketsMock.mockImplementation(async (url: string) => {
      const ids = new URL(url).searchParams.get('ids')!.split(',');
      return ids.map(id => ({ id, image: OK_URL(id) }));
    });
  });

  describe('sniffImageType', () => {
    it('reconoce PNG, JPEG y WebP por su firma, no por lo que diga la cabecera', () => {
      expect(icons.sniffImageType(PNG)).toBe('image/png');
      expect(icons.sniffImageType(JPEG)).toBe('image/jpeg');
      expect(icons.sniffImageType(WEBP)).toBe('image/webp');
    });

    it('rechaza SVG (puede contener scripts), HTML y datos vacíos', () => {
      expect(icons.sniffImageType(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>'))).toBeNull();
      expect(icons.sniffImageType(Buffer.from('<html></html>'))).toBeNull();
      expect(icons.sniffImageType(Buffer.alloc(0))).toBeNull();
    });
  });

  describe('isAllowedIconUrl', () => {
    it('solo HTTPS y dominios de imágenes de CoinGecko', () => {
      expect(icons.isAllowedIconUrl('https://coin-images.coingecko.com/coins/images/1/large/bitcoin.png')).toBe(true);
      expect(icons.isAllowedIconUrl('https://assets.coingecko.com/coins/images/1/large/bitcoin.png')).toBe(true);
      expect(icons.isAllowedIconUrl('http://coin-images.coingecko.com/x.png')).toBe(false);
      expect(icons.isAllowedIconUrl('https://evil.example/x.png')).toBe(false);
      expect(icons.isAllowedIconUrl('https://coin-images.coingecko.com@evil.example/x.png')).toBe(false);
      expect(icons.isAllowedIconUrl('https://coin-images.coingecko.com.evil.example/x.png')).toBe(false);
      expect(icons.isAllowedIconUrl('no es una url')).toBe(false);
    });

    it('admite las banderas de flagcdn.com (#246), solo por HTTPS y sin subdominios falsos', () => {
      expect(icons.isAllowedIconUrl('https://flagcdn.com/h80/eu.png')).toBe(true);
      expect(icons.isAllowedIconUrl('http://flagcdn.com/h80/eu.png')).toBe(false);
      expect(icons.isAllowedIconUrl('https://flagcdn.com.evil.example/h80/eu.png')).toBe(false);
      expect(icons.isAllowedIconUrl('https://flagcdn.com@evil.example/h80/eu.png')).toBe(false);
    });
  });

  describe('withAliasIcons (#246)', () => {
    const aliases = { BETH: 'ETH', WBTC: 'BTC' };
    it('un alias sin logo propio usa la versión del logo de su destino', () => {
      expect(icons.withAliasIcons({ ETH: 5 }, aliases)).toEqual({ ETH: 5, BETH: 5 });
    });
    it('el logo propio del alias tiene prioridad; sin logo del destino no se añade', () => {
      expect(icons.withAliasIcons({ ETH: 5, BETH: 9 }, aliases)).toEqual({ ETH: 5, BETH: 9 });
      expect(icons.withAliasIcons({}, aliases)).toEqual({});
    });
  });

  describe('syncAssetIcons', () => {
    it('guarda los logos válidos y marca como «sin logo» el resto', async () => {
      downloads = { bitcoin: PNG, ethereum: 'html', ripple: 'big' };
      await icons.syncAssetIcons({ force: true });
      const rows = (await pool.query(`SELECT symbol, status, content_type FROM asset_icons WHERE ${CRYPTO} ORDER BY symbol`)).rows;
      expect(rows).toEqual([
        { symbol: 'BTC', status: 'ok', content_type: 'image/png' },
        { symbol: 'ETH', status: 'missing', content_type: null },   // HTML: no es una imagen
        { symbol: 'XRP', status: 'missing', content_type: null },   // supera el tamaño máximo
      ]);
    });

    it('descarta URL fuera de la lista permitida sin descargarlas', async () => {
      marketsMock.mockImplementation(async () => [{ id: 'bitcoin', image: 'https://evil.example/bitcoin.png' }]);
      await icons.syncAssetIcons({ force: true });
      const hosts = vi.mocked(fetch).mock.calls.map(c => new URL(String(c[0])).hostname);
      expect(hosts.every(h => h === 'flagcdn.com')).toBe(true);   // solo banderas, nunca el dominio ajeno
      const btc = (await pool.query(`SELECT status FROM asset_icons WHERE symbol = 'BTC'`)).rows[0];
      expect(btc.status).toBe('missing');
    });

    it('no vuelve a descargar los que ya tiene ni los «sin logo» recientes', async () => {
      downloads = { bitcoin: PNG };
      await icons.syncAssetIcons({ force: true });
      marketsMock.mockClear();
      await icons.syncAssetIcons({ force: true });
      expect(marketsMock).not.toHaveBeenCalled();
    });

    it('reintenta los «sin logo» pasados 7 días', async () => {
      await icons.syncAssetIcons({ force: true });
      await pool.query(`UPDATE asset_icons SET fetched_at = NOW() - INTERVAL '8 days' WHERE symbol = 'ETH'`);
      marketsMock.mockClear();
      downloads = { ethereum: PNG };
      await icons.syncAssetIcons({ force: true });
      expect(marketsMock).toHaveBeenCalledTimes(1);
      expect(new URL(marketsMock.mock.calls[0][0]).searchParams.get('ids')).toBe('ethereum');
      const eth = (await pool.query(`SELECT status FROM asset_icons WHERE symbol = 'ETH'`)).rows[0];
      expect(eth.status).toBe('ok');
    });

    it('un fallo de CoinGecko no rompe nada ni marca los activos, y las banderas siguen', async () => {
      marketsMock.mockRejectedValue(new Error('rate limit'));
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      downloads = { eu: PNG };
      await expect(icons.syncAssetIcons({ force: true })).resolves.toBeUndefined();
      expect((await pool.query(`SELECT count(*)::int AS n FROM asset_icons WHERE ${CRYPTO}`)).rows[0].n).toBe(0);
      expect((await pool.query(`SELECT status FROM asset_icons WHERE symbol = 'EUR'`)).rows[0].status).toBe('ok');
    });

    it('las monedas fiat guardan su bandera (#246); sin bandera quedan «sin logo»', async () => {
      downloads = { eu: PNG, us: PNG, gb: 'html' };
      await icons.syncAssetIcons({ force: true });
      const rows = (await pool.query(`SELECT symbol, status FROM asset_icons WHERE symbol IN ('EUR', 'USD', 'GBP') ORDER BY symbol`)).rows;
      expect(rows).toEqual([
        { symbol: 'EUR', status: 'ok' },
        { symbol: 'GBP', status: 'missing' },
        { symbol: 'USD', status: 'ok' },
      ]);
      const urls = vi.mocked(fetch).mock.calls.map(c => String(c[0]));
      expect(urls).toContain('https://flagcdn.com/h80/eu.png');
    });

    it('una moneda fiat con coingecko_id no se pide a CoinGecko', async () => {
      await pool.query(`INSERT INTO asset_metadata (symbol, name, coingecko_id) VALUES ('EUR', 'Euro', 'euro-test')`);
      await icons.syncAssetIcons({ force: true });
      const ids = marketsMock.mock.calls.flatMap(c => new URL(c[0]).searchParams.get('ids')!.split(','));
      expect(ids).not.toContain('euro-test');
    });
  });

  describe('rutas', () => {
    beforeEach(async () => {
      await pool.query(`INSERT INTO asset_icons (symbol, status, content_type, data) VALUES ('BTC', 'ok', 'image/png', $1)`, [PNG]);
      await pool.query(`INSERT INTO asset_icons (symbol, status) VALUES ('ETH', 'missing')`);
    });

    it('GET /icons lista solo los activos con logo (y sus alias), con una versión para la caché', async () => {
      const res = await request(app).get('/api/assets/icons');
      expect(res.status).toBe(200);
      expect(Object.keys(res.body).sort()).toEqual(['BTC', 'BTCB', 'WBTC']);   // ETH «sin logo»: BETH/WETH tampoco
      expect(typeof res.body.BTC).toBe('number');
    });

    it('GET /:symbol/icon sirve la imagen con cabeceras restrictivas', async () => {
      const res = await request(app).get('/api/assets/btc/icon');
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toBe('image/png');
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['content-security-policy']).toContain("default-src 'none'");
      expect(res.headers['cache-control']).toContain('max-age');
      expect(Buffer.compare(res.body as Buffer, PNG)).toBe(0);
    });

    it('un alias sin logo propio sirve el de su destino y aparece en la lista (#246)', async () => {
      await pool.query(`UPDATE asset_icons SET status = 'ok', content_type = 'image/png', data = $1 WHERE symbol = 'ETH'`, [PNG]);
      const list = await request(app).get('/api/assets/icons');
      expect(list.body.BETH).toBe(list.body.ETH);
      const res = await request(app).get('/api/assets/BETH/icon');
      expect(res.status).toBe(200);
      expect(Buffer.compare(res.body as Buffer, PNG)).toBe(0);
    });

    it('404 para un activo sin logo o desconocido; 400 para un símbolo inválido', async () => {
      expect((await request(app).get('/api/assets/ETH/icon')).status).toBe(404);
      expect((await request(app).get('/api/assets/NOEXISTE/icon')).status).toBe(404);
      expect((await request(app).get('/api/assets/BETH/icon')).status).toBe(404);   // alias cuyo destino no tiene logo
      expect((await request(app).get('/api/assets/..%2Fetc/icon')).status).toBe(400);
      expect((await request(app).get('/api/assets/' + 'A'.repeat(30) + '/icon')).status).toBe(400);
    });
  });
});
