import { BalanceProvider, BalanceResult, fetchWithTimeout } from './types';

const BASE_URL = 'https://mainnet-public.mirrornode.hedera.com/api/v1';

export const hederaProvider: BalanceProvider = {
  requiresApiKey: false,
  async getBalance(address): Promise<BalanceResult> {
    try {
      const res = await fetchWithTimeout(`${BASE_URL}/accounts/${address}`);
      if (!res.ok) return { ok: false, error: `Mirror Node respondió ${res.status}` };
      const data = await res.json();
      const tinybars = data?.balance?.balance;
      if (typeof tinybars !== 'number') return { ok: false, error: 'respuesta sin balance' };
      return { ok: true, balance: tinybars / 100_000_000 };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'fallo desconocido' };
    }
  },
};
