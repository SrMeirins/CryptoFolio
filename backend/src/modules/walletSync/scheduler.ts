import cron from 'node-cron';
import { registerAllProviders } from './providers';
import { syncAllWalletAddresses, verificarSiAntiguas } from './walletSync';

// '0 3 * * *' — cada día a las 03:00 (hora del servidor). Fuera de horas
// activas típicas, y el saldo on-chain no cambia salvo que el usuario opere,
// así que no se necesita mayor frecuencia (ver spec: umbral de discrepancia).
export function scheduleWalletSync(): void {
  registerAllProviders();
  cron.schedule('0 3 * * *', () => {
    syncAllWalletAddresses().catch(err =>
      console.error('[walletSync] error en la sincronización diaria:', err instanceof Error ? err.message : err)
    );
  });
  // Si el backend no estaba levantado a las 03:00 (p. ej. app de escritorio), al
  // arrancar se verifica lo que lleve más de 24 h sin comprobar (#336). Con margen
  // para no competir con el resto del arranque.
  setTimeout(() => {
    verificarSiAntiguas().catch(err =>
      console.error('[walletSync] error en la verificación al arrancar:', err instanceof Error ? err.message : err)
    );
  }, 30_000).unref();
}
