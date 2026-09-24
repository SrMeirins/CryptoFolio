import { BalanceProvider, BalanceResult, fetchWithTimeout } from './types';

// Subscan exige API key desde 2026 y su distribución de keys pasa ahora por
// la pasarela PubFi (Authorization: Bearer), no por el host directo de
// Subscan con X-API-Key — verificado en vivo contra la API real, la
// documentación pública que describía el flujo antiguo ya no aplica.
const BASE_URL = 'https://api.pubfi.ai/v1/gateway/subscan';
const NETWORK_SLUG = 'assethub-polkadot';

interface PubfiTokensResponse {
  code: number;
  message?: string;
  data?: { native?: { symbol: string; decimals: number; balance: string }[] };
}

export const subscanProvider: BalanceProvider = {
  requiresApiKey: true,
  async getBalance(address, apiKey): Promise<BalanceResult> {
    if (!apiKey) return { ok: false, error: 'falta API key para Polkadot Asset Hub (Subscan)' };
    try {
      const res = await fetchWithTimeout(`${BASE_URL}/${NETWORK_SLUG}/api/scan/account/tokens`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ address }),
      });
      const data = (await res.json()) as PubfiTokensResponse;
      if (data.code !== 0) return { ok: false, error: data.message ?? 'fallo del gateway PubFi/Subscan' };
      const native = data.data?.native?.[0];
      if (!native) return { ok: false, error: 'sin balance nativo en la respuesta' };
      return { ok: true, balance: Number(native.balance) / 10 ** native.decimals };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'fallo desconocido' };
    }
  },
};
