// Evaluación de las alertas (#519). Funciones puras: reciben el precio o los
// valores ya calculados y deciden si la alerta se dispara o se rearma.

export type Sentido = 'por_encima' | 'por_debajo';
export type Repeticion = 'una_vez' | 'cada_vez';

/** Margen para rearmar una alerta «cada vez»: el precio debe volver al otro lado un 1 % (#519). */
export const MARGEN_REARME = 0.01;
/** Una alerta de cartera avisa como mucho una vez cada 24 h. */
export const INTERVALO_CARTERA_MS = 24 * 3_600_000;

export interface EstadoPrecio { sentido: Sentido; precio: number; repeticion: Repeticion; armada: boolean }

export type Decision = { accion: 'disparar' } | { accion: 'rearmar' } | { accion: 'nada' };

/** ¿Ha cruzado el umbral? «Por encima»: precio ≥ umbral; «por debajo»: precio ≤ umbral. */
export function cruza(sentido: Sentido, umbral: number, precio: number): boolean {
  return sentido === 'por_encima' ? precio >= umbral : precio <= umbral;
}

/**
 * Decide con el precio actual (en la moneda de la alerta). Una alerta armada
 * que cruza se dispara; una «cada vez» desarmada se rearma cuando el precio
 * vuelve al otro lado con el margen; si no, nada.
 */
export function decidirPrecio(a: EstadoPrecio, precio: number): Decision {
  if (!(precio > 0)) return { accion: 'nada' };
  if (a.armada) return cruza(a.sentido, a.precio, precio) ? { accion: 'disparar' } : { accion: 'nada' };
  if (a.repeticion !== 'cada_vez') return { accion: 'nada' };
  const vuelto = a.sentido === 'por_encima' ? precio <= a.precio * (1 - MARGEN_REARME) : precio >= a.precio * (1 + MARGEN_REARME);
  return vuelto ? { accion: 'rearmar' } : { accion: 'nada' };
}

/** Precio de un activo en la moneda pedida a partir de su precio en EUR y el de USDT en EUR. */
export function enMoneda(precioEur: number | null, moneda: 'EUR' | 'USD', usdtEur: number | null): number | null {
  if (precioEur === null) return null;
  if (moneda === 'EUR') return precioEur;
  return usdtEur && usdtEur > 0 ? precioEur / usdtEur : null;
}

/**
 * Cambio del valor de la cartera en 24 h (%), con las cantidades actuales a
 * precio en vivo frente a precio de hace 24 h (sin depósitos ni retiradas).
 * Solo cuentan los activos con ambos precios.
 */
export function cambioCartera(cantidades: ReadonlyMap<string, number>, ahora: ReadonlyMap<string, number>, hace24: ReadonlyMap<string, number>): number | null {
  let actual = 0;
  let previo = 0;
  for (const [asset, qty] of cantidades) {
    const p = ahora.get(asset);
    const p0 = hace24.get(asset);
    if (!(p && p > 0 && p0 && p0 > 0) || !(qty > 0)) continue;
    actual += qty * p;
    previo += qty * p0;
  }
  return previo > 0 ? ((actual - previo) / previo) * 100 : null;
}

/** ¿Dispara la alerta de cartera? Cambio en cualquier sentido ≥ umbral y sin aviso en las últimas 24 h. */
export function decidirCartera(umbralPct: number, cambioPct: number | null, ultimoDisparo: Date | null, ahora: Date): boolean {
  if (cambioPct === null || Math.abs(cambioPct) < umbralPct) return false;
  return !ultimoDisparo || ahora.getTime() - ultimoDisparo.getTime() >= INTERVALO_CARTERA_MS;
}
