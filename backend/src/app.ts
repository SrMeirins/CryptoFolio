import 'express-async-errors';
import express from 'express';
import path from 'path';
import fs from 'fs';
import morgan from 'morgan';
import { securityHeaders } from './middleware/security';
import { buildCorsMiddleware } from './middleware/cors';
import { globalLimiter } from './middleware/rateLimit';
import { errorHandler } from './middleware/errorHandler';
import healthRouter from './routes/health';
import importsRouter from './routes/imports';
import fifoRouter from './routes/fifo';
import pricesRouter from './routes/prices';
import catalogRouter from './routes/catalog';
import settingsRouter from './routes/settings';
import transactionsRouter from './routes/transactions';
import fiscalRouter from './routes/fiscal';
import walletsRouter from './routes/wallets';

const app = express();

app.use(securityHeaders);
app.use(buildCorsMiddleware());

// Logging (structured, sin datos sensibles)
app.use(morgan('combined'));

app.use(globalLimiter);

app.use(express.json({ limit: '10mb' }));

app.use('/health', healthRouter);
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

// Error handler — nunca filtra detalles internos al cliente (ver middleware/errorHandler.ts)
app.use(errorHandler);

export default app;
