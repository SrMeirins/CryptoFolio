import { BalanceProvider, BalanceResult, fetchJson } from './types';

const BASE_URL = 'https://mainnet-public.mirrornode.hedera.com/api/v1';

// Forma parcial de GET /accounts/:addr (solo lo que consumimos)
interface HederaAccount {
  balance?: { balance?: number };
}

export const hederaProvider: BalanceProvider = {
  requiresApiKey: false,
  async getBalance(address): Promise<BalanceResult> {
    const res = await fetchJson<HederaAccount>(`${BASE_URL}/accounts/${address}`, 'Mirror Node');
    if (!res.ok) return res;
    const tinybars = res.data.balance?.balance;
    if (typeof tinybars !== 'number') return { ok: false, error: 'respuesta sin balance' };
    return { ok: true, balance: tinybars / 100_000_000 };
  },
};
