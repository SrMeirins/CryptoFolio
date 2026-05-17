import { Router } from 'express';
import { getAllLivePrices, onPriceUpdate, getHistoricalPriceEur } from '../modules/prices/binance';
import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';

const router = Router();

// GET /api/prices/live
router.get('/live', (_req, res) => {
  const prices = getAllLivePrices();
  res.json(Object.fromEntries(prices));
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