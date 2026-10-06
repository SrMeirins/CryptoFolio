// Registra todos los proveedores conocidos. Se importa una sola vez desde
// walletSync.ts para poblar el registry antes de la primera sincronización.
//
// Cobertura incompleta respecto a `networks` en schema.sql: BNB Chain,
// Avalanche y Tron son redes seleccionables por el usuario (GET
// /api/wallets/networks las devuelve sin filtrar) pero NO tienen provider
// registrado aquí — walletSync.ts falla de forma segura con "sin
// proveedor registrado para esta red" si se añade una dirección en alguna
// de ellas (sin corrupción de datos, pero sin verificación on-chain real).
// BNB Chain/Avalanche son EVM-compatibles (BscScan/SnowTrace, mismo patrón
// que etherscanProvider.ts); Tron usa TronScan (patrón distinto). Pendiente
// de turno dedicado — requiere nuevas API keys y tests propios.
import { registerProvider } from './registry';
import { xrplProvider } from './xrplProvider';
import { hederaProvider } from './hederaProvider';
import { stellarProvider } from './stellarProvider';
import { blockstreamProvider } from './blockstreamProvider';
import { etherscanProvider } from './etherscanProvider';
import { solanaProvider } from './solanaProvider';
import { blockfrostProvider } from './blockfrostProvider';
import { subscanProvider } from './subscanProvider';

export function registerAllProviders(): void {
  registerProvider('XRP Ledger', xrplProvider);
  registerProvider('HBAR', hederaProvider);
  registerProvider('Stellar', stellarProvider);
  registerProvider('Bitcoin', blockstreamProvider);
  registerProvider('Ethereum', etherscanProvider);
  registerProvider('Solana', solanaProvider);
  registerProvider('Cardano', blockfrostProvider);
  registerProvider('Polkadot Asset Hub', subscanProvider);
}
