import 'express-async-errors';
import express from 'express';
import { createServer } from 'http';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { db } from './db/client';
import importsRouter from './routes/imports';
import fifoRouter from './routes/fifo';
import pricesRouter, { setupPricesWebSocket } from './routes/prices';
import { startLivePrices } from './modules/prices/binance';
import catalogRouter from './routes/catalog';
import settingsRouter from './routes/settings';


const app = express();
const server = createServer(app);
const PORT = parseInt(process.env.BACKEND_PORT || '3001', 10);

app.use(helmet());
app.use(cors({
  origin: process.env.NODE_ENV === 'development'
    ? ['http://localhost:5173', 'http://127.0.0.1:5173']
    : [],
  credentials: true,
}));
app.use(morgan('dev'));
app.use(express.json({ limit: '10mb' }));

app.get('/health', async (_req, res) => {
  try {
    await db.query('SELECT 1');
    res.json({ status: 'ok', db: 'connected', timestamp: new Date().toISOString() });
  } catch {
    res.status(503).json({ status: 'error', db: 'disconnected', timestamp: new Date().toISOString() });
  }
});

app.get('/api/ping', (_req, res) => {
  res.json({ message: 'CryptoTracker API v1.0' });
});

app.use('/api/imports', importsRouter);
app.use('/api/fifo', fifoRouter);
app.use('/api/prices', pricesRouter);
app.use('/api/catalog', catalogRouter);
app.use('/api/settings', settingsRouter);


app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[ERROR]', err.message);
  if (process.env.NODE_ENV === 'development') console.error(err.stack);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined,
  });
});

async function bootstrap() {
  try {
    await db.query('SELECT NOW()');
    console.log('[DB] Conexión a PostgreSQL establecida ✓');
    setupPricesWebSocket(server);
    server.listen(PORT, '0.0.0.0', () => {
      console.log(`[SERVER] CryptoTracker backend escuchando en puerto ${PORT}`);
      startLivePrices();
    });
  } catch (err) {
    console.error('[FATAL] No se pudo conectar a PostgreSQL:', err);
    process.exit(1);
  }
}

bootstrap();
