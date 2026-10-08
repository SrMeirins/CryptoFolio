import { Router, Request, Response } from 'express';
import { z } from 'zod';
import {
  getAllLivePrices, onPriceUpdate, offPriceUpdate,
  getAllOpen24Prices, onOpen24Update, offOpen24Update,
  lookupHistoricalPriceEur,
} from '../modules/prices/binance';
import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';
import { sendInternalError } from '../middleware/errorHandler';

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

// Parámetros de GET /api/prices/historical. El símbolo se normaliza a
// mayúsculas y sigue el mismo formato que el resto de rutas de activos; la
// fecha debe ser un día real en formato YYYY-MM-DD y no posterior a hoy.
const historicalQuerySchema = z.object({
  asset: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{1,20}$/),
  date: z.string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .refine(d => {
      const parsed = new Date(`${d}T00:00:00.000Z`);
      return !isNaN(parsed.getTime())
        && parsed.toISOString().startsWith(d)   // descarta fechas inexistentes (2025-02-30)
        && parsed.getTime() <= Date.now();
    }),
});

// GET /api/prices/historical?asset=XRP&date=2025-04-09
router.get('/historical', async (req, res) => {
  const parsed = historicalQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: 'Parámetros inválidos: asset (1-20 caracteres alfanuméricos) y date (YYYY-MM-DD, no futura) son obligatorios' });
    return;
  }
  const { asset, date } = parsed.data;

  try {
    const price = await lookupHistoricalPriceEur(asset, new Date(`${date}T00:00:00.000Z`));
    res.json({ asset, date, price_eur: price });
  } catch (e) {
    sendInternalError(res, e, 'GET /api/prices/historical');
  }
});

// Canales difundidos por el WebSocket de la app:
// - `prices`: último precio en EUR por activo.
// - `open24`: precio en EUR de hace 24h (apertura de la ventana móvil de
//   Binance), para la variación de 24h en tiempo real (#147).
// Al conectar se envía el snapshot de cada canal; después, solo los precios
// que cambian, agrupados como mucho una vez por segundo.
export function setupPricesWebSocket(server: Server): void {
  const wss = new WebSocketServer({ server, path: '/ws/prices' });

  wss.on('connection', (ws: WebSocket) => {
    const send = (type: 'prices' | 'open24', prices: Map<string, number>) => {
      if (ws.readyState === WebSocket.OPEN && prices.size > 0) {
        ws.send(JSON.stringify({ type, payload: Object.fromEntries(prices) }));
      }
    };

    send('prices', getAllLivePrices());
    send('open24', getAllOpen24Prices());

    const onPrices = (prices: Map<string, number>) => send('prices', prices);
    const onOpen24 = (prices: Map<string, number>) => send('open24', prices);

    onPriceUpdate(onPrices);
    onOpen24Update(onOpen24);
    ws.on('close', () => {
      offPriceUpdate(onPrices);
      offOpen24Update(onOpen24);
    });
  });
}

export default router;