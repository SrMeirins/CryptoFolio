import { paprikaDisponible, precioActualPaprikaEur, precioDiaPaprikaUsd } from './coinpaprika';
import { circuitoOkx, cierreDiaOkxUsdt, precioActualOkxUsdt } from './okx';
import { dentroDeUnAnio } from './seleccion';

// Cascada de respaldo tras Binance y CoinGecko (#337), según lo que cubre cada
// fuente: en vivo CoinPaprika → OKX; por día, el último año CoinPaprika → OKX y
// lo anterior solo OKX. Devuelve el precio en EUR y la fuente, o null si ninguna
// lo tiene. Lanza solo si alguna falló por la red sin que otra lo resolviera
// (el llamador lo trata como temporal y reintenta después).

export type FuenteRespaldo = 'coinpaprika' | 'okx';
export interface PrecioRespaldo { precio: number; fuente: FuenteRespaldo }

async function probar(intentos: Array<() => Promise<PrecioRespaldo | null>>): Promise<PrecioRespaldo | null> {
  let errorRed: unknown = null;
  for (const intento of intentos) {
    try {
      const r = await intento();
      if (r) return r;
    } catch (e) {
      errorRed = e;
    }
  }
  if (errorRed) throw errorRed;
  return null;
}

/** `usdtEur`: precio de 1 USDT en EUR ahora (para OKX). */
export function precioActualRespaldo(symbol: string, usdtEur: () => number | null): Promise<PrecioRespaldo | null> {
  return probar([
    async () => {
      if (!paprikaDisponible()) return null;
      const p = await precioActualPaprikaEur(symbol);
      return p ? { precio: p, fuente: 'coinpaprika' } : null;
    },
    async () => {
      const tipo = usdtEur();
      if (!circuitoOkx.permitido() || !tipo) return null;
      const p = await precioActualOkxUsdt(symbol);
      return p ? { precio: p * tipo, fuente: 'okx' } : null;
    },
  ]);
}

const diaAnterior = (dia: string) => new Date(Date.parse(`${dia}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);

/**
 * Precio a las 00:00 UTC del día `dia`, el mismo criterio que CoinGecko: en
 * CoinPaprika, el punto de ese instante; en OKX, el cierre de la vela del día
 * anterior (que termina justo entonces). `usdtEur`: 1 USDT en EUR (USD ≈ USDT).
 */
export function precioDiaRespaldo(symbol: string, dia: string, usdtEur: () => Promise<number | null>): Promise<PrecioRespaldo | null> {
  return probar([
    async () => {
      if (!dentroDeUnAnio(dia) || !paprikaDisponible()) return null;
      const usd = await precioDiaPaprikaUsd(symbol, dia);
      const tipo = usd ? await usdtEur() : null;
      return usd && tipo ? { precio: usd * tipo, fuente: 'coinpaprika' } : null;
    },
    async () => {
      if (!circuitoOkx.permitido()) return null;
      const usdt = await cierreDiaOkxUsdt(symbol, diaAnterior(dia));
      const tipo = usdt ? await usdtEur() : null;
      return usdt && tipo ? { precio: usdt * tipo, fuente: 'okx' } : null;
    },
  ]);
}
