import { db } from '../../../db/client';
import { fetchWithTimeout } from '../httpTimeout';
import { Circuito } from './circuito';
import { CuotaMensual } from './cuota';
import { dentroDeUnAnio, elegirIdPaprika, type MonedaPaprika } from './seleccion';

// CoinPaprika (#337): agregador sin clave, respaldo de CoinGecko. Precio en vivo
// en EUR; histórico diario solo del último año y en USD. Cuota mensual: se usa
// solo como respaldo y con presupuesto. Un fallo de red lanza (es temporal); la
// falta de dato devuelve null (definitivo).

const BASE = 'https://api.coinpaprika.com/v1';
export const circuitoPaprika = new Circuito();
export const cuotaPaprika = new CuotaMensual();

export function paprikaDisponible(): boolean {
  return circuitoPaprika.permitido() && cuotaPaprika.hayPresupuesto();
}

async function pedir(ruta: string): Promise<unknown> {
  let res: Response;
  try {
    res = await fetchWithTimeout(`${BASE}${ruta}`, { redirect: 'follow' });
  } catch (e) {
    circuitoPaprika.fallo();
    throw e;
  }
  cuotaPaprika.actualizar(res.headers);
  if (res.status === 429 || res.status >= 500) {
    circuitoPaprika.fallo();
    throw new Error(`CoinPaprika HTTP ${res.status}`);
  }
  circuitoPaprika.exito();
  if (!res.ok) return null; // 400/402/404: sin dato en el plan gratuito
  return res.json();
}

const idsEnMemoria = new Map<string, string | null>();

/** Id de CoinPaprika del activo: de asset_metadata o buscado una vez y guardado. */
export async function idPaprika(symbol: string): Promise<string | null> {
  if (idsEnMemoria.has(symbol)) return idsEnMemoria.get(symbol)!;
  const guardado = await db.query('SELECT coinpaprika_id FROM asset_metadata WHERE symbol = $1', [symbol]);
  if (guardado.rows[0]?.coinpaprika_id) {
    idsEnMemoria.set(symbol, guardado.rows[0].coinpaprika_id);
    return guardado.rows[0].coinpaprika_id;
  }
  const r = await pedir(`/search/?q=${encodeURIComponent(symbol)}&c=currencies&limit=10`) as { currencies?: MonedaPaprika[] } | null;
  const id = elegirIdPaprika(r?.currencies ?? [], symbol);
  idsEnMemoria.set(symbol, id);
  if (id) await db.query('UPDATE asset_metadata SET coinpaprika_id = $1 WHERE symbol = $2', [id, symbol]);
  return id;
}

/** Precio actual en EUR; null si CoinPaprika no lo tiene. */
export async function precioActualPaprikaEur(symbol: string): Promise<number | null> {
  const id = await idPaprika(symbol);
  if (!id) return null;
  const r = await pedir(`/tickers/${encodeURIComponent(id)}?quotes=EUR`) as { quotes?: { EUR?: { price?: number } } } | null;
  const p = r?.quotes?.EUR?.price;
  return p && p > 0 ? p : null;
}

/** Precio en USD del día (00:00 UTC); solo dentro del último año. */
export async function precioDiaPaprikaUsd(symbol: string, dia: string): Promise<number | null> {
  if (!dentroDeUnAnio(dia)) return null;
  const id = await idPaprika(symbol);
  if (!id) return null;
  const r = await pedir(`/tickers/${encodeURIComponent(id)}/historical?start=${dia}&interval=1d&limit=1&quote=usd`) as Array<{ timestamp: string; price: number }> | null;
  const fila = Array.isArray(r) ? r.find(x => x.timestamp.startsWith(dia)) : undefined;
  return fila && fila.price > 0 ? fila.price : null;
}
