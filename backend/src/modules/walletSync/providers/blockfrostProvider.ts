import { BalanceProvider, BalanceResult, fetchWithTimeout } from './types';

const BASE_URL = 'https://cardano-mainnet.blockfrost.io/api/v0';

export const blockfrostProvider: BalanceProvider = {
  requiresApiKey: true,
  async getBalance(address, apiKey): Promise<BalanceResult> {
    if (!apiKey) return { ok: false, error: 'falta API key para Cardano (Blockfrost)' };
    try {
      const res = await fetchWithTimeout(`${BASE_URL}/addresses/${address}`, {
        headers: { project_id: apiKey },
      });
      if (!res.ok) return { ok: false, error: `Blockfrost respondió ${res.status}` };
      const data = await res.json();
      const lovelace = (data?.amount ?? []).find((a: { unit: string }) => a.unit === 'lovelace');
      if (!lovelace) return { ok: false, error: 'sin unidad lovelace en la respuesta' };
      return { ok: true, balance: Number(lovelace.quantity) / 1_000_000 };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'fallo desconocido' };
    }
  },
};
