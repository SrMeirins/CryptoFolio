import { BalanceProvider, BalanceResult, fetchJson } from './types';

const RPC_URL = 'https://api.mainnet-beta.solana.com';

interface RpcResponse {
  result?: { value: unknown };
  error?: { message: string };
}

function rpcCall(method: string, params: unknown[]) {
  return fetchJson<RpcResponse>(RPC_URL, 'Solana RPC', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
}

export const solanaProvider: BalanceProvider = {
  requiresApiKey: false,
  async getBalance(address, _apiKey, contractAddress): Promise<BalanceResult> {
    if (!contractAddress) {
      const res = await rpcCall('getBalance', [address]);
      if (!res.ok) return res;
      if (res.data.error) return { ok: false, error: res.data.error.message };
      const lamports = (res.data.result?.value as number) ?? 0;
      return { ok: true, balance: lamports / 1e9 };
    }

    const res = await rpcCall('getTokenAccountsByOwner', [
      address,
      { mint: contractAddress },
      { encoding: 'jsonParsed' },
    ]);
    if (!res.ok) return res;
    if (res.data.error) return { ok: false, error: res.data.error.message };
    const accounts = (res.data.result?.value as Array<{ account: { data: { parsed: { info: { tokenAmount: { uiAmount: number | null } } } } } }>) ?? [];
    if (accounts.length === 0) return { ok: true, balance: 0 };
    const total = accounts.reduce(
      (sum, acc) => sum + (acc.account.data.parsed.info.tokenAmount.uiAmount ?? 0),
      0
    );
    return { ok: true, balance: total };
  },
};
