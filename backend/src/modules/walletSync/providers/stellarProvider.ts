import { BalanceProvider, BalanceResult, fetchJson } from './types';

const BASE_URL = 'https://horizon.stellar.org';

// Forma parcial de GET /accounts/:addr (solo lo que consumimos)
interface StellarAccount {
  balances?: { asset_type: string; balance: string }[];
}

export const stellarProvider: BalanceProvider = {
  requiresApiKey: false,
  async getBalance(address): Promise<BalanceResult> {
    const res = await fetchJson<StellarAccount>(`${BASE_URL}/accounts/${address}`, 'Horizon');
    if (!res.ok) return res;
    const native = (res.data.balances ?? []).find((b) => b.asset_type === 'native');
    if (!native) return { ok: false, error: 'sin balance nativo en la respuesta' };
    return { ok: true, balance: parseFloat(native.balance) };
  },
};
