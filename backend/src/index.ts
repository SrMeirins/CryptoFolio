import { createServer } from 'http';
import app from './app';
import { db, pool } from './db/client';
import { runMigrations } from './db/run-migrations';
import { runStartupRepairs } from './db/repairs';
import { setupPricesWebSocket } from './routes/prices';
import { startLivePrices } from './modules/prices/binance';
import { repairMissingCoinGeckoIds } from './modules/prices/coingecko';

const server = createServer(app);
const PORT = parseInt(process.env.BACKEND_PORT || '3001', 10);

async function bootstrap() {
  try {
    await db.query('SELECT NOW()');
    console.log('[DB] Connected');

    // En modo Electron/standalone, aplicar schema y migraciones automáticamente
    if (process.env.ELECTRON_MODE === 'true') {
      await runMigrations();
    }
    setupPricesWebSocket(server);

    await runStartupRepairs();

    // BACKEND_HOST lo fija electron/backend-manager.ts a '127.0.0.1' para no
    // exponer el puerto a la LAN en la app de escritorio (app single-user, sin
    // auth). En Docker no se define y cae a '0.0.0.0' (el host ya restringe el
    // acceso vía el mapeo de puertos en docker-compose.yml).
    const host = process.env.BACKEND_HOST || '0.0.0.0';
    server.listen(PORT, host, () => {
      console.log(`[SERVER] Listening on ${host}:${PORT}`);
      startLivePrices();
      // Reparar en background activos con price_source='coingecko' pero coingecko_id=NULL.
      // No bloquea el arranque; usa la cola con rate limit de CoinGecko.
      repairMissingCoinGeckoIds().catch(e =>
        console.error('[STARTUP] Error reparando coingecko_ids:', e)
      );
    });
  } catch (err) {
    console.error('[FATAL] Cannot connect to PostgreSQL:', err);
    process.exit(1);
  }
}

bootstrap();

// ── Graceful shutdown ───────────────────────────────────────────────────────
// Docker manda SIGTERM en `down`/`restart`; sin esto el proceso se mata en
// seco y el pool de Postgres queda colgado hasta que el OS limpia el socket.
function shutdown(signal: string) {
  console.log(`[SERVER] ${signal} recibido, cerrando...`);
  server.close(() => {
    pool.end()
      .then(() => process.exit(0))
      .catch(() => process.exit(1));
  });
  // Por si quedan conexiones WebSocket abiertas bloqueando el close, forzar salida.
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
