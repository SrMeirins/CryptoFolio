import type { BalanceProvider } from './types';

const registry = new Map<string, BalanceProvider>();

export function registerProvider(networkName: string, provider: BalanceProvider): void {
  registry.set(networkName, provider);
}

export function getProviderForNetwork(networkName: string): BalanceProvider | undefined {
  return registry.get(networkName);
}
