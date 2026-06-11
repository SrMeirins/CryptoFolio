import { Router, Request, Response } from 'express';
import { getAllLivePrices, onPriceUpdate, getHistoricalPriceEur } from '../modules/prices/binance';
import { db } from '../db/client';
import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';

const router = Router();

// Cache de 60s para precios CoinGecko (evita spamear la API en cada req del dashboard)
let cgLiveCache: { prices: Record<string, number>; at: number } | null = null;
const CG_TTL = 60_000;

const CG_BASE = 'https://api.coingecko.com/api/v3';

// GET /api/prices/live
router.get('/live', async (_req: Request, res: Response) => {
  const prices = Object.fromEntries(getAllLivePrices());

  try {
    const now = Date.now();
    if (!cgLiveCache || now - cgLiveCache.at > CG_TTL) {
      // Leer símbolo + coingecko_id directamente de la DB (sin depender del map en memoria)
      const cgAssets = await db.query(
        "SELECT symbol, coingecko_id FROM asset_metadata WHERE price_source = 'coingecko' AND coingecko_id IS NOT NULL"
      );
      if (cgAssets.rows.length > 0) {
        const ids = cgAssets.rows.map((r: { coingecko_id: string }) => r.coingecko_id).join(',');
        const url = `${CG_BASE}/simple/price?ids=${ids}&vs_currencies=eur`;
        const data = await fetch(url, { headers: { Accept: 'application/json' } })
          .then(r => r.json()) as Record<string, { eur: number }>;
        const cgPrices: Record<string, number> = {};
        for (const row of cgAssets.rows as { symbol: string; coingecko_id: string }[]) {
          const eur = data[row.coingecko_id]?.eur;
          if (eur != null) cgPrices[row.symbol] = eur;
        }
        cgLiveCache = { prices: cgPrices, at: now };
      } else {
        cgLiveCache = { prices: {}, at: now };
      }
    }
    Object.assign(prices, cgLiveCache.prices);
  } catch {
    // CoinGecko no disponible — se usan solo precios WebSocket
  }

  res.json(prices);
});

// GET /api/prices/historical?asset=XRP&date=2025-04-09
router.get('/historical', async (req, res) => {
  const { asset, date } = req.query;

  if (!asset || !date) {
    res.status(400).json({ error: 'asset y date son requeridos' });
    return;
  }

  try {
    const dateObj = new Date(date as string);
    if (isNaN(dateObj.getTime())) {
      res.status(400).json({ error: 'Formato de fecha inválido. Usar YYYY-MM-DD' });
      return;
    }

    const price = await getHistoricalPriceEur(asset as string, dateObj);
    res.json({ asset, date, price_eur: price });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

export function setupPricesWebSocket(server: Server): void {
  const wss = new WebSocketServer({ server, path: '/ws/prices' });

  wss.on('connection', (ws: WebSocket) => {
    const current = getAllLivePrices();
    if (current.size > 0) {
      ws.send(JSON.stringify({ type: 'prices', payload: Object.fromEntries(current) }));
    }

    const handler = (prices: Map<string, number>) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'prices', payload: Object.fromEntries(prices) }));
      }
    };

    onPriceUpdate(handler);
  });
}

export default router;