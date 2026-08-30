// Registra todos los proveedores conocidos. Se importa una sola vez desde
// walletSync.ts para poblar el registry antes de la primera sincronización.
import { registerProvider } from './registry';
import { xrplProvider } from './xrplProvider';
import { hederaProvider } from './hederaProvider';
import { stellarProvider } from './stellarProvider';
import { blockstreamProvider } from './blockstreamProvider';
import { etherscanProvider } from './etherscanProvider';

export function registerAllProviders(): void {
  registerProvider('XRP Ledger', xrplProvider);
  registerProvider('HBAR', hederaProvider);
  registerProvider('Stellar', stellarProvider);
  registerProvider('Bitcoin', blockstreamProvider);
  registerProvider('Ethereum', etherscanProvider);
}
