import { createServer } from 'http';
import { parsePriceSourcesOffline } from './modules/prices/offlineMode';
import { envTimezone } from './modules/time/appTimezone';
import app from './app';
import { db, pool } from './db/client';
import { runMigrations } from './db/run-migrations';
import { claveMaestraDisponible } from './modules/walletSync/apiKeyCrypto';
import { cargarClaveCoinGecko } from './modules/conexiones/conexiones';
import { setupPricesWebSocket } from './routes/prices';
import { startLivePrices } from './modules/prices/binance';
import { iniciarAlertas } from './modules/alertas/servicio';
import { syncAssetIcons } from './modules/assets/assetIcons';
import { startPairCompletion } from './modules/prices/pairCompletion';
import { repairMissingCoinGeckoIds } from './modules/prices/coingecko';
import { scheduleWalletSync } from './modules/walletSync/scheduler';
import { scheduleAutoBackups } from './modules/backup/autoBackup';

const server = createServer(app);
const PORT = parseInt(process.env.BACKEND_PORT || '3001', 10);

// Configuración inválida → no arrancar (fallo seguro, #359).
try {
  if (parsePriceSourcesOffline(process.env.PRICE_SOURCES_OFFLINE)) console.info('[CONFIG] PRICE_SOURCES_OFFLINE=true: precios solo desde la caché');
  // Zona horaria (#388): una APP_TIMEZONE desconocida impide arrancar.
  const envTz = envTimezone();
  if (envTz) console.info(`[CONFIG] APP_TIMEZONE=${envTz}`);
} catch (err) {
  console.error('[FATAL]', (err as Error).message);
  process.exit(1);
}

async function bootstrap() {
  try {
    await db.query('SELECT NOW()');
    console.log('[DB] Connected');

    // Aplicar schema y migraciones automáticamente en cada arranque — tanto en
    // Docker como en Electron. Idempotente (runMigrations solo aplica lo pendiente,
    // registrado en schema_migrations), así que es seguro correrlo siempre.
    await runMigrations();
    // Clave maestra (versión 1.0): si está definida pero no es válida, mejor
    // parar con un mensaje claro que fallar después al cifrar claves o copias.
    if (process.env.WALLET_SYNC_ENCRYPTION_KEY && !claveMaestraDisponible()) {
      console.error('[FATAL] WALLET_SYNC_ENCRYPTION_KEY no es válida: debe ser una clave de 32 bytes en base64 (genera una con: openssl rand -base64 32).');
      process.exit(1);
    }
    // Clave de CoinGecko guardada en Ajustes, Conexiones (si no, la del entorno).
    await cargarClaveCoinGecko().catch(e => console.error('[STARTUP] No se pudo cargar la clave de CoinGecko:', e));
    setupPricesWebSocket(server);
    scheduleWalletSync();
    // Copias automáticas cifradas con la clave del equipo (#454).
    scheduleAutoBackups();

    // BACKEND_HOST lo fija electron/backend-manager.ts a '127.0.0.1' para no
    // exponer el puerto a la LAN en la app de escritorio (app single-user, sin
    // auth). En Docker no se define y cae a '0.0.0.0' (el host ya restringe el
    // acceso vía el mapeo de puertos en docker-compose.yml).
    const host = process.env.BACKEND_HOST || '0.0.0.0';
    server.listen(PORT, host, () => {
      console.log(`[SERVER] Listening on ${host}:${PORT}`);
      startLivePrices();
      // Alertas de precio y de cartera (#519): se evalúan con los precios en vivo.
      iniciarAlertas();
      // Logos de los activos (#201): en segundo plano, sin retrasar el arranque.
      void syncAssetIcons({ force: true });
      // Pares de Binance que falten (EUR, USDT, BTC, ETH) para el feed en vivo (#277).
      startPairCompletion();
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
