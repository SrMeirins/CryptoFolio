import { db } from '../../db/client';
import { fetchVelas, getHistoricalPriceEur, isDefinitiveNoData, type Vela } from './binance';
import { getOrDetectPairInfo } from './pairDetector';
import { dedupeByKey } from './priceDedup';
import { PRICE_ALIASES } from './priceAliases';

// Precio del momento de una operación (#599). El valor de mercado de una
// transmisión es el del momento en que se hace (manual práctico IRPF de la
// AEAT, «Compra y venta de monedas virtuales»), no el cierre del día.
//
// Para cada activo y minuto (UTC):
// 1. Vela de 1 minuto de Binance de ese minuto; si no hubo operaciones en él,
//    la más cercana dentro de ±15 minutos. Precio: el medio negociado en la
//    vela (volumen en cotización / volumen); con volumen 0, el cierre.
// 2. Sin velas de minuto: la vela de 1 hora más cercana (±1 hora).
// 3. Sin nada de eso: el precio del día (respaldo), indicado como «1d».
// Pares en orden de liquidez: USDT, EUR, BTC y ETH. USDT se convierte con la
// vela de EURUSDT del mismo minuto; BTC y ETH, con su propio precio del momento.
// Se guarda en price_momento. Los fallos de red no se guardan: el siguiente
// recálculo lo reintenta y mientras tanto se usa el precio del día.

export type FuentePrecio = '1m' | '1h' | '1d';
export interface PrecioMomento { precio: number; fuente: FuentePrecio }

const MINUTO_MS = 60_000;
const HORA_MS = 60 * MINUTO_MS;
const VENTANA_MINUTO_MS = 15 * MINUTO_MS;
const ORDEN_FUENTE: Record<FuentePrecio, number> = { '1m': 0, '1h': 1, '1d': 2 };

/** La peor de dos fuentes: un precio convertido es tan preciso como su parte menos precisa. */
export function peorFuente(a: FuentePrecio, b: FuentePrecio): FuentePrecio {
  return ORDEN_FUENTE[a] >= ORDEN_FUENTE[b] ? a : b;
}

/** Precio medio negociado en una vela; sin volumen, su cierre. */
export function precioVela(v: Vela): number {
  return v.volumen > 0 && v.volumenCotizacion > 0 ? v.volumenCotizacion / v.volumen : v.cierre;
}

/** Vela con operaciones más cercana a un instante; null si ninguna tuvo volumen. */
export function velaMasCercana(velas: readonly Vela[], instanteMs: number, duracionMs: number): Vela | null {
  let mejor: Vela | null = null;
  let mejorDist = Infinity;
  for (const v of velas) {
    if (!(v.volumen > 0) || !(v.cierre > 0)) continue;
    const dist = instanteMs >= v.inicio && instanteMs < v.inicio + duracionMs ? 0 : Math.abs(v.inicio + duracionMs / 2 - instanteMs);
    if (dist < mejorDist) { mejor = v; mejorDist = dist; }
  }
  return mejor;
}

/** Precio de un par en el momento: minuto o, si no, hora. null si no hay velas. */
async function precioParMomento(pair: string, instanteMs: number): Promise<{ precio: number; fuente: '1m' | '1h' } | null> {
  const minutos = await fetchVelas(pair, '1m', instanteMs - VENTANA_MINUTO_MS, instanteMs + VENTANA_MINUTO_MS);
  const m = velaMasCercana(minutos, instanteMs, MINUTO_MS);
  if (m) return { precio: precioVela(m), fuente: '1m' };
  const horas = await fetchVelas(pair, '1h', instanteMs - 2 * HORA_MS, instanteMs + HORA_MS);
  const h = velaMasCercana(horas, instanteMs, HORA_MS);
  return h ? { precio: precioVela(h), fuente: '1h' } : null;
}

const enCurso = new Map<string, Promise<PrecioMomento>>();

/**
 * Precio en EUR de un activo en el momento de una operación. Si no hay precio
 * del momento, el del día con fuente «1d»; precio 0 si no hay ninguno.
 */
export async function getPrecioMomentoEur(symbol: string, instante: Date): Promise<PrecioMomento> {
  if (symbol === 'EUR') return { precio: 1, fuente: '1m' };
  if (PRICE_ALIASES[symbol]) return getPrecioMomentoEur(PRICE_ALIASES[symbol], instante);
  const minuto = Math.floor(instante.getTime() / MINUTO_MS) * MINUTO_MS;
  return dedupeByKey(enCurso, `${symbol}|${minuto}`, () => calcular(symbol, minuto, instante));
}

async function calcular(symbol: string, minuto: number, instante: Date): Promise<PrecioMomento> {
  const momento = new Date(minuto);
  const cached = await db.query('SELECT price_eur, fuente FROM price_momento WHERE asset = $1 AND momento = $2', [symbol, momento]);
  if (cached.rows.length > 0) {
    return { precio: Math.max(0, parseFloat(cached.rows[0].price_eur)), fuente: cached.rows[0].fuente as FuentePrecio };
  }

  let transitorio = !velasDisponibles();
  let resultado: PrecioMomento | null = null;
  if (!transitorio) try {
    resultado = await precioDelMomento(symbol, instante.getTime());
  } catch (e) {
    // Red, límite agotado o modo sin red: no se guarda y se reintenta en el próximo recálculo.
    transitorio = !isDefinitiveNoData(e);
  }

  if (!resultado) {
    const diario = await getHistoricalPriceEur(symbol, instante);
    resultado = { precio: diario, fuente: '1d' };
    // Sin precio del día tampoco: no se guarda, para no fijar un 0.
    if (transitorio || !(diario > 0)) return resultado;
  }

  await db.query(
    `INSERT INTO price_momento (asset, momento, price_eur, fuente) VALUES ($1, $2, $3, $4)
     ON CONFLICT (asset, momento) DO NOTHING`,
    [symbol, momento, resultado.precio, resultado.fuente]);
  return resultado;
}

/**
 * El proveedor ofrece velas. Un proveedor simulado que solo da el precio del
 * día (los tests que no prueban esto) no la tiene: se usa el del día sin
 * detectar pares ni salir a la red.
 */
function velasDisponibles(): boolean {
  try {
    return typeof fetchVelas === 'function';
  } catch {
    return false;
  }
}

async function precioDelMomento(symbol: string, instanteMs: number): Promise<PrecioMomento | null> {
  const instante = new Date(instanteMs);
  const info = await getOrDetectPairInfo(symbol);

  // USDT y estables tratadas como fiat: el inverso de EURUSDT en ese momento.
  if (symbol === 'USDT' || info.priceSource === 'fiat') {
    const eur = await precioParMomento('EURUSDT', instanteMs);
    if (!eur || !(eur.precio > 0)) return null;
    const usdtEur = { precio: 1 / eur.precio, fuente: eur.fuente as FuentePrecio };
    if (symbol === 'USDT') return usdtEur;
    // Estable sin par propio: vale 1 USDT.
    if (!info.binanceUsdtPair) return usdtEur;
  }

  const rutas: Array<[string | null, string | null]> = [
    [info.binanceUsdtPair, 'USDT'],
    [info.binanceEurPair, null],
    [info.binanceBtcPair, 'BTC'],
    [info.binanceEthPair, 'ETH'],
  ];
  for (const [pair, cotizacion] of rutas) {
    if (!pair) continue;
    const p = await precioParMomento(pair, instanteMs);
    if (!p || !(p.precio > 0)) continue;
    if (!cotizacion) return p;
    const conv = await getPrecioMomentoEur(cotizacion, instante);
    if (!(conv.precio > 0)) continue;
    return { precio: p.precio * conv.precio, fuente: peorFuente(p.fuente, conv.fuente) };
  }
  return null;
}
