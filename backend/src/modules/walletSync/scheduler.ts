import cron from 'node-cron';
import { registerAllProviders } from './providers';
import { syncAllWalletAddresses } from './walletSync';

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
}
