import { Router, Request, Response } from 'express';
import { getAllLivePrices, onPriceUpdate, getHistoricalPriceEur } from '../modules/prices/binance';
import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';

const router = Router();

// GET /api/prices/live
//
// Hasta la refactorización de binance.ts (fallback periódico CoinGecko para
// activos price_source='coingecko' sin par de Binance), este endpoint tenía
// su PROPIO fetch directo a CoinGecko con una caché TTL local — saltándose
// la cola con rate-limit compartida de coingeckoClient.ts (sin reintento ni
// timeout). getAllLivePrices() ya incluye esos mismos precios, refrescados
// en segundo plano cada PRICE_REFRESH_INTERVAL_MS y empujados también por
// WebSocket, así que ese bloque quedó redundante y se elimina.
router.get('/live', (_req: Request, res: Response) => {
  res.json(Object.fromEntries(getAllLivePrices()));
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