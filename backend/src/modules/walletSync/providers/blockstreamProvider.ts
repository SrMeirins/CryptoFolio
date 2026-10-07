import { BalanceProvider, BalanceResult, fetchJson } from './types';

const BASE_URL = 'https://blockstream.info/api';

// Forma parcial de GET /address/:addr (solo lo que consumimos)
interface BlockstreamAddress {
  chain_stats?: { funded_txo_sum?: number; spent_txo_sum?: number };
}

export const blockstreamProvider: BalanceProvider = {
  requiresApiKey: false,
  async getBalance(address): Promise<BalanceResult> {
    const res = await fetchJson<BlockstreamAddress>(`${BASE_URL}/address/${address}`, 'Esplora');
    if (!res.ok) return res;
    const sats = (res.data.chain_stats?.funded_txo_sum ?? 0) - (res.data.chain_stats?.spent_txo_sum ?? 0);
    return { ok: true, balance: sats / 100_000_000 };
  },
};
