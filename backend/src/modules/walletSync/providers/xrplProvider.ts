import { BalanceProvider, BalanceResult, fetchWithTimeout } from './types';

const RPC_URL = 'https://xrplcluster.com';

export const xrplProvider: BalanceProvider = {
  requiresApiKey: false,
  async getBalance(address): Promise<BalanceResult> {
    try {
      const res = await fetchWithTimeout(RPC_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          method: 'account_info',
          params: [{ account: address, ledger_index: 'validated' }],
        }),
      });
      const data = await res.json();
      if (data?.result?.status !== 'success' || !data.result.account_data?.Balance) {
        return { ok: false, error: data?.result?.error ?? 'respuesta inesperada de XRPL' };
      }
      const drops = Number(data.result.account_data.Balance);
      return { ok: true, balance: drops / 1_000_000 };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'fallo desconocido' };
    }
  },
};
