// Lógica pura de las fuentes de respaldo (#337).

const DIA = 86_400_000;

export interface MonedaPaprika { id: string; symbol: string; rank: number; is_active: boolean }

/**
 * Id de CoinPaprika para un símbolo: misma sigla, activa y la de mejor ranking
 * (un ranking 0 es «sin ranking» y va al final). null si no hay ninguna.
 */
export function elegirIdPaprika(monedas: readonly MonedaPaprika[], symbol: string): string | null {
  const candidatas = monedas.filter(m => m.is_active && m.symbol.toUpperCase() === symbol.toUpperCase());
  candidatas.sort((a, b) => (a.rank || Infinity) - (b.rank || Infinity));
  return candidatas[0]?.id ?? null;
}

/** El plan gratuito de CoinPaprika solo sirve histórico diario del último año. */
export function dentroDeUnAnio(dia: string, ahora = Date.now()): boolean {
  return Date.parse(`${dia}T00:00:00Z`) > ahora - 364 * DIA;
}

/**
 * Cierre en USDT de la vela diaria de OKX (bar=1Dutc) del día pedido: la fila
 * es [inicio_ms, apertura, máximo, mínimo, cierre, ...]. null si no es de ese día.
 */
export function cierreVelaOkx(filas: readonly unknown[][], dia: string): number | null {
  const inicio = Date.parse(`${dia}T00:00:00Z`);
  const fila = filas.find(f => Number(f[0]) === inicio);
  const cierre = fila ? parseFloat(String(fila[4])) : NaN;
  return cierre > 0 ? cierre : null;
}

export const instrumentoOkx = (symbol: string) => `${symbol.toUpperCase()}-USDT`;
