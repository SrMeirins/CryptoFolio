import 'express-async-errors';
import express from 'express';
import { createServer } from 'http';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import { db } from './db/client';
import importsRouter from './routes/imports';
import fifoRouter from './routes/fifo';
import pricesRouter, { setupPricesWebSocket } from './routes/prices';
import { startLivePrices } from './modules/prices/binance';
import catalogRouter from './routes/catalog';
import settingsRouter from './routes/settings';
import transactionsRouter from './routes/transactions';
import fiscalRouter from './routes/fiscal';
import walletsRouter from './routes/wallets';

const app = express();
const server = createServer(app);
const PORT = parseInt(process.env.BACKEND_PORT || '3001', 10);
const isProd = process.env.NODE_ENV === 'production';

// ── Security headers ───────────────────────────────────────────────────────
app.use(helmet({
  crossOriginEmbedderPolicy: false,
  contentSecurityPolicy: isProd ? {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc:  ["'self'"],
      styleSrc:   ["'self'", "'unsafe-inline'"],
      imgSrc:     ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'", 'wss:', 'https:'],
    },
  } : false,
}));

// ── CORS ───────────────────────────────────────────────────────────────────
const corsOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map(s => s.trim())
  : isProd ? [] : ['http://localhost:5173', 'http://127.0.0.1:5173'];

app.use(cors({ origin: corsOrigins, credentials: true }));

// ── Logging ────────────────────────────────────────────────────────────────
app.use(morgan(isProd ? 'combined' : 'dev'));

// ── Rate limiting ──────────────────────────────────────────────────────────
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});

const importLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Import limit reached, please wait before importing again.' },
});

const fiscalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many export requests.' },
});

app.use(globalLimiter);
app.use('/api/imports', importLimiter);
app.use('/api/fiscal', fiscalLimiter);

// ── Body parsing ───────────────────────────────────────────────────────────
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
app.use('/api/transactions', transactionsRouter);
app.use('/api/fiscal', fiscalRouter);
app.use('/api/wallets', walletsRouter);

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
