import { fetchVelas, isDefinitiveNoData, type Vela } from '../prices/binance';
import { precioVela, velaMasCercana } from '../prices/momento';

// Zona horaria de un CSV de Binance (#599). La columna «Time» no indica en qué
// zona se exportó, y leerla como UTC cuando no lo es desplaza cada operación
// varias horas. Se deduce comparando el precio de las órdenes del archivo
// (pagado entre recibido) con el negociado en Binance a cada desfase posible:
// el desfase real es el que hace coincidir las órdenes con el mercado.
//
// 1. Hasta 20 órdenes repartidas en el tiempo (no Convert ni saldos a BNB,
//    que llevan su comisión en el cambio).
// 2. Para cada una, las velas horarias de ±14 h: cuenta en qué desfases su
//    precio cae dentro de la vela (máximo y mínimo, con un 0,1 % de margen).
// 3. Entre los tres desfases con más coincidencias, el de menor error medio
//    con velas de 1 minuto (precio medio negociado).

export const DESFASE_MIN = -12;
export const DESFASE_MAX = 14;
const HORA_MS = 3_600_000;
const MINUTO_MS = 60_000;
const MAX_MUESTRAS = 20;
const MAX_AFINADO = 8;
const MARGEN_VELA = 0.001;
/** Error medio con velas de minuto por debajo del cual la coincidencia es clara. */
const ERROR_CLARO = 0.005;

const COTIZACIONES = new Set(['USDT', 'USDC', 'FDUSD', 'BUSD', 'BTC', 'ETH', 'BNB', 'EUR']);

export type Confianza = 'alta' | 'baja' | 'sin_datos';

export interface DeteccionZona {
  /** Horas respecto de UTC (UTC+2 = 2); null si no se pudo deducir. */
  desfaseHoras: number | null;
  /** Órdenes cuyo precio cae en el mercado con ese desfase. */
  coincidencias: number;
  muestras: number;
  confianza: Confianza;
}

/** Orden de muestra: par de Binance, precio pagado por unidad e instante leído como UTC. */
export interface OrdenMuestra { pair: string; precio: number; instanteMs: number }

/** Una orden con lo que hace falta para sacar su precio. */
export interface OrdenParaZona {
  operationType: string;
  asset: string;
  costAsset?: string | null;
  amount: number;
  costAmount?: number | null;
  timestamp: Date | string;
  notes?: string | null;
}

/** Órdenes de muestra repartidas en el tiempo (pura). */
export function muestrasDeOrdenes(ordenes: readonly OrdenParaZona[], max = MAX_MUESTRAS): OrdenMuestra[] {
  const validas = ordenes
    .filter(o => (o.operationType === 'BUY' || o.operationType === 'SELL')
      && !!o.costAsset && COTIZACIONES.has(o.costAsset) && o.asset !== o.costAsset && o.asset !== 'EUR'
      && o.amount > 0 && (o.costAmount ?? 0) > 0
      && !String(o.notes ?? '').startsWith('Binance Convert') && !String(o.notes ?? '').startsWith('Small Assets'))
    .map(o => ({ pair: `${o.asset}${o.costAsset}`, precio: (o.costAmount as number) / o.amount, instanteMs: new Date(o.timestamp).getTime() }))
    .sort((a, b) => a.instanteMs - b.instanteMs);
  if (validas.length <= max) return validas;
  const paso = validas.length / max;
  return Array.from({ length: max }, (_, i) => validas[Math.floor(i * paso)]);
}

/** La orden encaja en la vela que contiene ese instante (pura). */
export function encajaEnVela(m: OrdenMuestra, velas: readonly Vela[], desfase: number): boolean {
  const real = m.instanteMs - desfase * HORA_MS;
  const v = velas.find(x => real >= x.inicio && real < x.inicio + HORA_MS);
  if (!v || !(v.volumen > 0)) return false;
  const bajo = v.bajo ?? v.cierre;
  const alto = v.alto ?? v.cierre;
  return m.precio >= bajo * (1 - MARGEN_VELA) && m.precio <= alto * (1 + MARGEN_VELA);
}

/** Coincidencias de cada desfase entre las muestras (pura). */
export function puntuarDesfases(muestras: readonly OrdenMuestra[], velas: readonly (Vela[] | null)[]): Map<number, number> {
  const puntos = new Map<number, number>();
  for (let d = DESFASE_MIN; d <= DESFASE_MAX; d++) {
    puntos.set(d, muestras.reduce((n, m, i) => n + (velas[i] && encajaEnVela(m, velas[i]!, d) ? 1 : 0), 0));
  }
  return puntos;
}

function mediana(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  return s.length === 0 ? Infinity : s[Math.floor(s.length / 2)];
}

/** Error medio con velas de 1 minuto de un desfase sobre unas muestras. */
async function errorMinuto(muestras: readonly OrdenMuestra[], desfase: number): Promise<number> {
  const errores: number[] = [];
  for (const m of muestras) {
    const real = m.instanteMs - desfase * HORA_MS;
    const velas = await fetchVelas(m.pair, '1m', real - 2 * MINUTO_MS, real + 2 * MINUTO_MS);
    const v = velaMasCercana(velas, real, MINUTO_MS);
    if (v) errores.push(Math.abs(precioVela(v) / m.precio - 1));
  }
  return mediana(errores);
}

/**
 * Detecta la zona horaria de las órdenes de un CSV de Binance. Sin red o sin
 * órdenes comparables, «sin_datos»: la importación pregunta.
 */
export async function detectarZonaHoraria(ordenes: readonly OrdenParaZona[]): Promise<DeteccionZona> {
  const muestras = muestrasDeOrdenes(ordenes);
  const sinDatos: DeteccionZona = { desfaseHoras: null, coincidencias: 0, muestras: muestras.length, confianza: 'sin_datos' };
  if (muestras.length === 0) return sinDatos;

  const velas: (Vela[] | null)[] = [];
  try {
    for (const m of muestras) {
      try {
        velas.push(await fetchVelas(m.pair, '1h', m.instanteMs - (DESFASE_MAX + 1) * HORA_MS, m.instanteMs - (DESFASE_MIN - 1) * HORA_MS));
      } catch (e) {
        // Par inexistente: esa muestra no cuenta. Un fallo de red corta la detección.
        if (!isDefinitiveNoData(e)) throw e;
        velas.push(null);
      }
    }
    const validas = velas.filter(v => v && v.length > 0).length;
    if (validas === 0) return sinDatos;

    const puntos = puntuarDesfases(muestras, velas);
    const candidatos = [...puntos].filter(([, n]) => n > 0)
      // Más coincidencias primero; a igualdad, el desfase más pequeño.
      .sort((a, b) => b[1] - a[1] || Math.abs(a[0]) - Math.abs(b[0]))
      .slice(0, 3);
    if (candidatos.length === 0) return { ...sinDatos, muestras: validas, confianza: 'baja' };

    const afinado = muestras.filter((_, i) => velas[i] && velas[i]!.length > 0).slice(0, MAX_AFINADO);
    let mejor = { desfase: candidatos[0][0], coincidencias: candidatos[0][1], error: Infinity };
    for (const [desfase, coincidencias] of candidatos) {
      const error = await errorMinuto(afinado, desfase);
      if (error < mejor.error) mejor = { desfase, coincidencias, error };
    }
    const alta = validas >= 5 && mejor.coincidencias / validas >= 0.7 && mejor.error < ERROR_CLARO;
    return { desfaseHoras: mejor.desfase, coincidencias: mejor.coincidencias, muestras: validas, confianza: alta ? 'alta' : 'baja' };
  } catch {
    return sinDatos;
  }
}
