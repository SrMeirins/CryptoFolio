export function abs(n: number): number {
  return Math.abs(n);
}

// Fiat real — depósitos/retiros de estas monedas no tienen lote FIFO.
// Ámbito: parsing de CSV de Binance (qué cuenta como fiat al interpretar una
// fila) — NO confundir con el FIAT_ASSETS de modules/fiscal/contrapartida.ts
// (ámbito distinto: qué es legal tender para Hacienda). Mismo nombre,
// propósito distinto; no fusionar ambas listas.
export const FIAT_ASSETS = new Set(['EUR', 'USD', 'GBP', 'CHF']);
