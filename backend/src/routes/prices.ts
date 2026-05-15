import { Router } from 'express';
import { getAllLivePrices, onPriceUpdate } from '../modules/prices/binance';
import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';

const router = Router();

router.get('/live', (_req, res) => {
  const prices = getAllLivePrices();
  res.json(Object.fromEntries(prices));
});

export function setupPricesWebSocket(server: Server): void {
  const wss = new WebSocketServer({ server, path: '/ws/prices' });

  wss.on('connection', (ws: WebSocket) => {
    // Enviar precios actuales inmediatamente al conectar
    const current = getAllLivePrices();
    if (current.size > 0) {
      ws.send(JSON.stringify({ type: 'prices', payload: Object.fromEntries(current) }));
    }

    // Suscribir a actualizaciones
    const handler = (prices: Map<string, number>) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'prices', payload: Object.fromEntries(prices) }));
      }
    };

    onPriceUpdate(handler);
  });
}

export default router;
