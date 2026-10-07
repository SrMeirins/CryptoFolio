// Patrón de deduplicación de requests concurrentes, idéntico hasta ahora en
// coingeckoPrices.ts y binance.ts: sin esto, N llamadas concurrentes para el
// mismo (symbol, date) generarían N requests a la API externa en vez de
// compartir una única Promise. Cada caller mantiene su PROPIO Map in-flight
// (los de Binance y CoinGecko son estados independientes) — este helper solo
// centraliza la lógica de "mirar/registrar/limpiar", no el estado.
export function dedupeByKey<T>(
  inFlight: Map<string, Promise<T>>,
  key: string,
  fn: () => Promise<T>
): Promise<T> {
  const existing = inFlight.get(key);
  if (existing) return existing;

  const promise = fn().finally(() => inFlight.delete(key));
  inFlight.set(key, promise);
  return promise;
}

export function priceKey(symbol: string, date: Date): string {
  return `${symbol}|${date.toISOString().slice(0, 10)}`;
}
