import { Router } from 'express';
import { db } from '../../db/client';
import { sendInternalError } from '../../middleware/errorHandler';
import { fetchWithTimeout } from '../../modules/prices/httpTimeout';

const router = Router();

// GET /api/fifo/yesterday-prices — openPrice de Binance 24h ticker para activos en cartera
// "openPrice" = precio hace exactamente 24 h (ventana deslizante de Binance)
let _ydayCache: { prices: Record<string, number>; at: number } | null = null;
const YDAY_TTL = 5 * 60_000; // 5 min

router.get('/yesterday-prices', async (_req, res) => {
  try {
    // Servir desde caché si es reciente
    if (_ydayCache && Date.now() - _ydayCache.at < YDAY_TTL) {
      return res.json({ prices: _ydayCache.prices });
    }

    // Activos en posición abierta con su info de par Binance
    const lotsResult = await db.query(`
      SELECT DISTINCT fl.asset,
             am.binance_eur_pair,
             am.binance_usdt_pair,
             am.price_source,
             am.is_stablecoin
      FROM fifo_lots fl
      LEFT JOIN asset_metadata am ON am.symbol = fl.asset
      WHERE fl.is_closed = FALSE AND fl.quantity_remaining > 0
    `);

    const pairMap = new Map<string, { asset: string; isUsdt: boolean }[]>();
    let needsEurUsdt = false;

    for (const row of lotsResult.rows as {
      asset: string; binance_eur_pair: string | null; binance_usdt_pair: string | null;
      price_source: string; is_stablecoin: boolean
    }[]) {
      if (row.price_source === 'fiat' || row.is_stablecoin) continue;
      if (row.binance_eur_pair) {
        const list = pairMap.get(row.binance_eur_pair) ?? [];
        list.push({ asset: row.asset, isUsdt: false });
        pairMap.set(row.binance_eur_pair, list);
      } else if (row.binance_usdt_pair) {
        const list = pairMap.get(row.binance_usdt_pair) ?? [];
        list.push({ asset: row.asset, isUsdt: true });
        pairMap.set(row.binance_usdt_pair, list);
        needsEurUsdt = true;
      }
    }

    const allPairs = [...pairMap.keys(), ...(needsEurUsdt ? ['EURUSDT'] : [])];
    if (allPairs.length === 0) {
      _ydayCache = { prices: {}, at: Date.now() };
      return res.json({ prices: {} });
    }

    const symbols = encodeURIComponent(JSON.stringify(allPairs));
    const tickerRes = await fetchWithTimeout(
      `https://api.binance.com/api/v3/ticker/24hr?symbols=${symbols}&type=MINI`
    );
    if (!tickerRes.ok) throw new Error(`Binance 24hr ticker: HTTP ${tickerRes.status}`);

    const tickers = await tickerRes.json() as Array<{ symbol: string; openPrice: string }>;
    const tickerMap = new Map(tickers.map(t => [t.symbol, parseFloat(t.openPrice)]));

    const eurusdtOpen = tickerMap.get('EURUSDT');
    const eurRateOpen = eurusdtOpen && eurusdtOpen > 0 ? 1 / eurusdtOpen : null;

    const prices: Record<string, number> = {};
    for (const [pair, assets] of pairMap) {
      const openPrice = tickerMap.get(pair);
      if (!openPrice || openPrice <= 0) continue;
      for (const { asset, isUsdt } of assets) {
        if (!isUsdt) {
          prices[asset] = openPrice;
        } else if (eurRateOpen) {
          prices[asset] = openPrice * eurRateOpen;
        }
      }
    }

    _ydayCache = { prices, at: Date.now() };
    res.json({ prices });
  } catch (e) {
    sendInternalError(res, e, 'GET /api/fifo/yesterday-prices');
  }
});

export default router;
