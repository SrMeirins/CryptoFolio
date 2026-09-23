import { BalanceProvider, BalanceResult, fetchWithTimeout } from './types';

const BASE_URL = 'https://blockstream.info/api';

// Forma parcial de GET /address/:addr (solo lo que consumimos)
interface BlockstreamAddress {
  chain_stats?: { funded_txo_sum?: number; spent_txo_sum?: number };
}

export const blockstreamProvider: BalanceProvider = {
  requiresApiKey: false,
  async getBalance(address): Promise<BalanceResult> {
    try {
      const res = await fetchWithTimeout(`${BASE_URL}/address/${address}`);
      if (!res.ok) return { ok: false, error: `Esplora respondió ${res.status}` };
      const data = (await res.json()) as BlockstreamAddress;
      const sats = (data?.chain_stats?.funded_txo_sum ?? 0) - (data?.chain_stats?.spent_txo_sum ?? 0);
      return { ok: true, balance: sats / 100_000_000 };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'fallo desconocido' };
    }
  },
};
