import { BalanceProvider, BalanceResult, fetchWithTimeout } from './types';

const RPC_URL = 'https://api.mainnet-beta.solana.com';

interface RpcResponse {
  result?: { value: unknown };
  error?: { message: string };
}

async function rpcCall(method: string, params: unknown[]): Promise<RpcResponse> {
  const res = await fetchWithTimeout(RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  return res.json();
}

export const solanaProvider: BalanceProvider = {
  requiresApiKey: false,
  async getBalance(address, _apiKey, contractAddress): Promise<BalanceResult> {
    try {
      if (!contractAddress) {
        const data = await rpcCall('getBalance', [address]);
        if (data.error) return { ok: false, error: data.error.message };
        const lamports = (data.result?.value as number) ?? 0;
        return { ok: true, balance: lamports / 1e9 };
      }

      const data = await rpcCall('getTokenAccountsByOwner', [
        address,
        { mint: contractAddress },
        { encoding: 'jsonParsed' },
      ]);
      if (data.error) return { ok: false, error: data.error.message };
      const accounts = (data.result?.value as Array<{ account: { data: { parsed: { info: { tokenAmount: { uiAmount: number | null } } } } } }>) ?? [];
      if (accounts.length === 0) return { ok: true, balance: 0 };
      const total = accounts.reduce(
        (sum, acc) => sum + (acc.account.data.parsed.info.tokenAmount.uiAmount ?? 0),
        0
      );
      return { ok: true, balance: total };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'fallo desconocido' };
    }
  },
};
