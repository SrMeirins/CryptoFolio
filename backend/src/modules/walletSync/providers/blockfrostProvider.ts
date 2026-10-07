import { BalanceProvider, BalanceResult, fetchJson } from './types';

const BASE_URL = 'https://cardano-mainnet.blockfrost.io/api/v0';

// Forma parcial de GET /addresses/:addr (solo lo que consumimos)
interface BlockfrostAddress {
  amount?: { unit: string; quantity: string }[];
}

export const blockfrostProvider: BalanceProvider = {
  requiresApiKey: true,
  async getBalance(address, apiKey): Promise<BalanceResult> {
    if (!apiKey) return { ok: false, error: 'falta API key para Cardano (Blockfrost)' };
    const res = await fetchJson<BlockfrostAddress>(`${BASE_URL}/addresses/${address}`, 'Blockfrost', {
      headers: { project_id: apiKey },
    });
    if (!res.ok) return res;
    const lovelace = (res.data.amount ?? []).find((a) => a.unit === 'lovelace');
    if (!lovelace) return { ok: false, error: 'sin unidad lovelace en la respuesta' };
    return { ok: true, balance: Number(lovelace.quantity) / 1_000_000 };
  },
};
