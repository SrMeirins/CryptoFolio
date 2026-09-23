import { BalanceProvider, BalanceResult, fetchWithTimeout } from './types';

const BASE_URL = 'https://horizon.stellar.org';

// Forma parcial de GET /accounts/:addr (solo lo que consumimos)
interface StellarAccount {
  balances?: { asset_type: string; balance: string }[];
}

export const stellarProvider: BalanceProvider = {
  requiresApiKey: false,
  async getBalance(address): Promise<BalanceResult> {
    try {
      const res = await fetchWithTimeout(`${BASE_URL}/accounts/${address}`);
      if (!res.ok) return { ok: false, error: `Horizon respondió ${res.status}` };
      const data = (await res.json()) as StellarAccount;
      const native = (data?.balances ?? []).find((b) => b.asset_type === 'native');
      if (!native) return { ok: false, error: 'sin balance nativo en la respuesta' };
      return { ok: true, balance: parseFloat(native.balance) };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'fallo desconocido' };
    }
  },
};
