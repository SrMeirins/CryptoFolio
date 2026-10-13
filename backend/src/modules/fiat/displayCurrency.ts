import { z } from 'zod';

// Moneda de visualización (#155/#175). Los importes se guardan en EUR; para USD
// se convierten con el tipo USD por EUR de su fecha, con USDT como referencia
// del dólar (el mismo criterio que el coste por lote del motor FIFO, #174).

export const currencySchema = z.enum(['EUR', 'USD']).default('EUR');
export type DisplayCurrency = z.infer<typeof currencySchema>;

/**
 * Tipo USD por EUR para una fecha (expresión SQL que da un timestamp), a partir
 * del precio diario de USDT en `price_cache` (fecha UTC, como getHistoricalPriceEur).
 * Si falta la fecha exacta se usa la más cercana: el EUR/USD apenas varía de un
 * día a otro. NULL si no hay ningún precio de USDT.
 */
export function usdPerEurSql(timestampExpr: string): string {
  const day = `(${timestampExpr} AT TIME ZONE 'UTC')::date`;
  // Rendimiento: primero la fecha exacta (búsqueda por índice); solo si falta
  // se recorre el histórico buscando la más cercana. COALESCE no evalúa la
  // segunda subconsulta cuando la primera da valor.
  return `COALESCE(
    (SELECT 1 / pc.price_eur FROM price_cache pc
     WHERE pc.asset = 'USDT' AND pc.price_date = ${day} AND pc.price_eur > 0),
    (SELECT 1 / pc.price_eur FROM price_cache pc
     WHERE pc.asset = 'USDT' AND pc.price_eur > 0
     ORDER BY abs(pc.price_date - ${day}), pc.price_date DESC
     LIMIT 1)
  )`;
}

/**
 * Factor de conversión de un importe en EUR a la moneda pedida, como
 * expresión SQL: 1 en EUR; el tipo de la fecha en USD (0 si no hay tipo,
 * para no mostrar euros como si fueran dólares).
 */
export function fxSql(currency: DisplayCurrency, timestampExpr: string): string {
  return currency === 'EUR' ? '1' : `COALESCE(${usdPerEurSql(timestampExpr)}, 0)`;
}
