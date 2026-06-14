import 'express-async-errors';
import express from 'express';
import { createServer } from 'http';
import path from 'path';
import fs from 'fs';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import { db } from './db/client';
import { runMigrations } from './db/run-migrations';
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

// ── Security headers ───────────────────────────────────────────────────────
app.use(helmet({
  crossOriginEmbedderPolicy: false,
  referrerPolicy: { policy: 'no-referrer' },
  permittedCrossDomainPolicies: { permittedPolicies: 'none' },
  contentSecurityPolicy: {
    directives: {
      defaultSrc:      ["'self'"],
      scriptSrc:       ["'self'"],
      styleSrc:        ["'self'", "'unsafe-inline'"],
      imgSrc:          ["'self'", 'data:'],
      // Restringir connectSrc a los dominios reales usados por la app
      connectSrc:      [
        "'self'",
        'wss://stream.binance.com:9443',
        'https://api.binance.com',
        'https://api.coingecko.com',
        // WebSocket local (dev y Electron)
        'ws://localhost:*',
        'wss://localhost:*',
      ],
      frameAncestors:  ["'none'"],
      formAction:      ["'self'"],
      upgradeInsecureRequests: [],
    },
  },
}));

// ── CORS ───────────────────────────────────────────────────────────────────
// En modo Electron el frontend carga desde file://, que envía Origin: null.
// El backend solo escucha en 127.0.0.1, así que permitir null es seguro.
const corsOrigin = process.env.ELECTRON_MODE === 'true'
  ? (origin: string | undefined, cb: (e: Error | null, allow?: boolean) => void) => cb(null, true)
  : process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',').map(s => s.trim())
    : ['http://localhost:5173', 'http://127.0.0.1:5173'];

app.use(cors({ origin: corsOrigin, credentials: true }));

// ── Logging (structured, sin datos sensibles) ──────────────────────────────
app.use(morgan('combined'));

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

// ── Health check (sin datos internos sensibles) ────────────────────────────
app.get('/health', async (_req, res) => {
  try {
    await db.query('SELECT 1');
    res.json({ status: 'ok' });
  } catch {
    res.status(503).json({ status: 'error' });
  }
});

app.use('/api/imports', importsRouter);
app.use('/api/fifo', fifoRouter);
app.use('/api/prices', pricesRouter);
app.use('/api/catalog', catalogRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/transactions', transactionsRouter);
app.use('/api/fiscal', fiscalRouter);
app.use('/api/wallets', walletsRouter);

// ── Frontend estático (solo en modo Electron) ──────────────────────────────
// El frontend se sirve desde el mismo origen que el backend (127.0.0.1:3001),
// eliminando CORS completamente. El catch-all envía index.html para React Router.
if (process.env.ELECTRON_MODE === 'true') {
  const frontendDist = path.join(__dirname, '..', '..', 'frontend', 'dist');
  if (fs.existsSync(frontendDist)) {
    app.use(express.static(frontendDist));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(frontendDist, 'index.html'));
    });
  }
}

// ── Error handler — nunca filtra detalles internos al cliente ─────────────
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[ERROR]', err.stack ?? err.message);
  res.status(500).json({ error: 'Internal server error' });
});

async function bootstrap() {
  try {
    await db.query('SELECT NOW()');
    console.log('[DB] Connected');

    // En modo Electron/standalone, aplicar schema y migraciones automáticamente
    if (process.env.ELECTRON_MODE === 'true') {
      const dbUrl = process.env.DATABASE_URL!;
      await runMigrations(dbUrl);
    }
    setupPricesWebSocket(server);
    server.listen(PORT, '0.0.0.0', () => {
      console.log(`[SERVER] Listening on port ${PORT}`);
      startLivePrices();
    });
  } catch (err) {
    console.error('[FATAL] Cannot connect to PostgreSQL:', err);
    process.exit(1);
  }
}

bootstrap();
