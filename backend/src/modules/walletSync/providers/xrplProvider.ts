import { BalanceProvider, BalanceResult, fetchJson } from './types';

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
    const res = await fetchJson<XrplAccountInfo>(RPC_URL, 'XRPL', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        method: 'account_info',
        params: [{ account: address, ledger_index: 'validated' }],
      }),
    });
    if (!res.ok) return res;
    const { result } = res.data;
    if (result?.status !== 'success' || !result?.account_data?.Balance) {
      return { ok: false, error: result?.error ?? 'respuesta inesperada de XRPL' };
    }
    return { ok: true, balance: Number(result.account_data.Balance) / 1_000_000 };
  },
};
