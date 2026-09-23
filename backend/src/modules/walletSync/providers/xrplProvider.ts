import { BalanceProvider, BalanceResult, fetchWithTimeout } from './types';

const RPC_URL = 'https://xrplcluster.com';

// Forma parcial de la respuesta RPC account_info (solo lo que consumimos)
interface XrplAccountInfo {
  result?: {
    status?: string;
    error?: string;
    account_data?: { Balance?: string | number };
  };
}

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
      const data = (await res.json()) as XrplAccountInfo;
      if (data?.result?.status !== 'success' || !data?.result?.account_data?.Balance) {
        return { ok: false, error: data?.result?.error ?? 'respuesta inesperada de XRPL' };
      }
      const balance = data?.result?.account_data?.Balance;
      return { ok: true, balance: Number(balance) / 1_000_000 };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'fallo desconocido' };
    }
  },
};
