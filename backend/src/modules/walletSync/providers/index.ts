// Registra todos los proveedores conocidos. Se importa una sola vez desde
// walletSync.ts para poblar el registry antes de la primera sincronización.
import { registerProvider } from './registry';
import { xrplProvider } from './xrplProvider';
import { hederaProvider } from './hederaProvider';

export function registerAllProviders(): void {
  registerProvider('XRP Ledger', xrplProvider);
  registerProvider('HBAR', hederaProvider);
}
