import { fetchWithTimeout } from '../httpTimeout';
import { Circuito } from './circuito';
import { cierreVelaOkx, instrumentoOkx } from './seleccion';

// OKX (#337): exchange con API pública sin clave. Pares en USDT y velas diarias
// con histórico profundo: es la única fuente gratuita para lo anterior a un año
// de los activos que no están en Binance. Fallo de red: lanza; sin par: null.

const BASE = 'https://www.okx.com/api/v5/market';
export const circuitoOkx = new Circuito();

async function pedir(ruta: string): Promise<unknown[] | null> {
  let res: Response;
  try {
    res = await fetchWithTimeout(`${BASE}${ruta}`);
  } catch (e) {
    circuitoOkx.fallo();
    throw e;
  }
  if (res.status === 429 || res.status >= 500) {
    circuitoOkx.fallo();
    throw new Error(`OKX HTTP ${res.status}`);
  }
  circuitoOkx.exito();
  const j = await res.json().catch(() => null) as { code?: string; data?: unknown[] } | null;
  return j && j.code === '0' && Array.isArray(j.data) ? j.data : null; // código ≠ 0: instrumento inexistente
}

/** Último precio en USDT; null si OKX no lista el par. */
export async function precioActualOkxUsdt(symbol: string): Promise<number | null> {
  const data = await pedir(`/ticker?instId=${encodeURIComponent(instrumentoOkx(symbol))}`) as Array<{ last?: string }> | null;
  const p = data?.[0]?.last ? parseFloat(data[0].last) : NaN;
  return p > 0 ? p : null;
}

/** Cierre en USDT de la vela diaria UTC del día; null si no hay. */
export async function cierreDiaOkxUsdt(symbol: string, dia: string): Promise<number | null> {
  const siguiente = Date.parse(`${dia}T00:00:00Z`) + 86_400_000;
  const data = await pedir(`/history-candles?instId=${encodeURIComponent(instrumentoOkx(symbol))}&bar=1Dutc&after=${siguiente}&limit=2`) as unknown[][] | null;
  return data ? cierreVelaOkx(data, dia) : null;
}
