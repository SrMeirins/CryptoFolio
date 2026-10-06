export type BalanceResult =
  | { ok: true; balance: number }
  | { ok: false; error: string };

export interface BalanceProvider {
  requiresApiKey: boolean;
  getBalance(address: string, apiKey: string | undefined, contractAddress?: string): Promise<BalanceResult>;
}

export const PROVIDER_TIMEOUT_MS = 8000;

export async function fetchWithTimeout(url: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export type JsonFetchResult<T> = { ok: true; data: T } | { ok: false; error: string };

// Centraliza fetch + timeout + comprobación de fallo HTTP + parseo JSON +
// captura de errores de red, común a la mayoría de providers. `serviceLabel`
// identifica el servicio en el mensaje de error ("Blockfrost respondió
// 404"), para no perder claridad al centralizar. El parseo del payload
// (campos específicos de cada blockchain) sigue siendo responsabilidad de
// cada provider — aquí solo se resuelve la capa de transporte HTTP.
export async function fetchJson<T>(url: string, serviceLabel: string, init?: RequestInit): Promise<JsonFetchResult<T>> {
  try {
    const res = await fetchWithTimeout(url, init);
    if (!res.ok) return { ok: false, error: `${serviceLabel} respondió ${res.status}` };
    return { ok: true, data: (await res.json()) as T };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'fallo desconocido' };
  }
}
