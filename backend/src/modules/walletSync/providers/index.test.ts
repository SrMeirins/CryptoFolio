import { describe, expect, it } from 'vitest';
import { registerAllProviders } from './index';
import { getProviderForNetwork } from './registry';

describe('registerAllProviders', () => {
  it('registra un provider para cada una de las 8 redes con cobertura on-chain', () => {
    registerAllProviders();
    const redesConProvider = ['XRP Ledger', 'HBAR', 'Stellar', 'Bitcoin', 'Ethereum', 'Solana', 'Cardano', 'Polkadot Asset Hub'];
    for (const red of redesConProvider) {
      expect(getProviderForNetwork(red)).toBeDefined();
    }
  });

  // Documenta el hueco real anotado en index.ts: estas 3 redes existen en
  // schema.sql y son seleccionables por el usuario, pero no tienen provider.
  // Si se implementa alguna, este test debe actualizarse (moverla a la
  // lista de arriba) — así el hueco no puede desaparecer en silencio.
  it('NO tiene provider para BNB Chain, Avalanche ni Tron (hueco conocido, ver index.ts)', () => {
    registerAllProviders();
    expect(getProviderForNetwork('BNB Chain')).toBeUndefined();
    expect(getProviderForNetwork('Avalanche')).toBeUndefined();
    expect(getProviderForNetwork('Tron')).toBeUndefined();
  });
});
