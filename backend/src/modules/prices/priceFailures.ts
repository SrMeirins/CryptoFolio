// Último fallo de precio de cada activo (#450), en memoria: se vacía al
// reiniciar el backend y vuelve a llenarse con el primer fallo. El motivo es un
// texto corto y genérico: nunca el mensaje del error, que puede llevar URL.

export type PriceSource = 'coingecko' | 'coinpaprika' | 'okx';
export type FailureReason = 'sin-respuesta' | 'sin-precio';
export interface PriceFailure { source: PriceSource; reason: FailureReason; at: string }

const failures = new Map<string, PriceFailure>();

export function recordPriceFailure(symbol: string, source: PriceSource, reason: FailureReason, now: Date = new Date()): void {
  failures.set(symbol, { source, reason, at: now.toISOString() });
}

export function getPriceFailure(symbol: string): PriceFailure | null {
  return failures.get(symbol) ?? null;
}

/** Solo para las pruebas. */
export function clearPriceFailures(): void {
  failures.clear();
}
