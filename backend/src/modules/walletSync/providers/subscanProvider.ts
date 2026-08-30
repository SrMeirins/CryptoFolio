import { BalanceProvider, BalanceResult, fetchWithTimeout } from './types';

const BASE_URL = 'https://assethub-polkadot.api.subscan.io';

export const subscanProvider: BalanceProvider = {
  requiresApiKey: true,
  async getBalance(address, apiKey): Promise<BalanceResult> {
    if (!apiKey) return { ok: false, error: 'falta API key para Polkadot Asset Hub (Subscan)' };
    try {
      const res = await fetchWithTimeout(`${BASE_URL}/api/v2/scan/account`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
        body: JSON.stringify({ key: address }),
      });
      const data = await res.json();
      if (data.code !== 0) return { ok: false, error: data.message ?? 'fallo de Subscan' };
      const balance = data?.data?.account?.balance;
      if (typeof balance !== 'string') return { ok: false, error: 'respuesta sin balance' };
      return { ok: true, balance: parseFloat(balance) };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'fallo desconocido' };
    }
  },
};
