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
