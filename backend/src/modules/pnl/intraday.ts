import { loadPositionEvents, holdingsAtInstants } from './positions';
import { loadCapitalFlows, type CapitalFlow } from './capitalFlows';
import { computeDailyPnl, valueHoldings, type DayValuation } from './dailyPnl';
import { quarterHourPricesEur, QUARTER_MS, type PriceSeries } from '../prices/intradayPrices';
import { PRICE_ALIASES } from '../prices/priceAliases';
import { getAllLivePrices } from '../prices/liveFeed';
import type { DisplayCurrency } from '../fiat/displayCurrency';

// Evolución intradía de las últimas 24 h (#215), para el periodo 24H del
// gráfico de evolución. Un punto cada 15 minutos más el instante actual
// (precios en vivo). Misma identidad que el P&L diario (computeDailyPnl): los
// depósitos y retiradas no cuentan como ganancia, y el % es la rentabilidad
// ponderada en el tiempo encadenando cada tramo de 15 min.

export const INTRADAY_HOURS = 24;
const CONCURRENCY = 6;

export interface IntradayPoint {
  at: string;     // instante ISO 8601 (UTC)
  value: number;  // valor de la cartera en la moneda pedida
  pnl: number;    // P&L acumulado desde el inicio de la ventana
  pct: number;    // rentabilidad acumulada (TWR) desde el inicio
  live: boolean;  // último punto, con precios en vivo
}

export interface IntradayResponse {
  currency: DisplayCurrency;
  from: string;
  to: string;
  stepMinutes: 15;
  totalPnl: number;
  twrPct: number;
  // Activos sin serie de 15 min (sin par en Binance o descarga fallida):
  // se valoran con el precio en vivo en toda la ventana.
  approximate: string[];
  points: IntradayPoint[];
}

const priceAsset = (asset: string) => PRICE_ALIASES[asset] ?? asset;

/** Instantes de la ventana: cuartos de hora desde hace `hours` horas y el instante actual al final. */
export function intradayInstants(now: number, hours = INTRADAY_HOURS, step = QUARTER_MS): number[] {
  const start = Math.floor((now - hours * 3_600_000) / step) * step;
  const instants: number[] = [];
  for (let t = start; t < now; t += step) instants.push(t);
  instants.push(now);
  return instants;
}

/**
 * Precio de cada instante a partir de una serie: el exacto; si falta, el último
 * conocido (o el primero, al principio de la ventana); el último instante usa
 * `live` si lo hay. null en todos si no hay ningún dato.
 */
export function pricesAtInstants(instants: readonly number[], series: PriceSeries | null, live: number | undefined): Array<number | null> {
  const out: Array<number | null> = instants.map((t, i) => {
    if (i === instants.length - 1 && live !== undefined && live > 0) return live;
    return series?.get(t) ?? null;
  });
  let last: number | null = null;
  for (let i = 0; i < out.length; i++) { if (out[i] !== null) last = out[i]; else out[i] = last; }
  const first = out.find(p => p !== null) ?? (live !== undefined && live > 0 ? live : null);
  return out.map(p => p ?? first);
}

/** Serie del gráfico: valoración de cada instante, flujos de cada tramo y P&L/TWR acumulados. */
export function buildIntradaySeries({ instants, holdings, flows, priceOf, fxAt }: {
  instants: readonly number[];
  holdings: ReadonlyArray<ReadonlyMap<string, number>>;
  flows: readonly CapitalFlow[];
  priceOf: (asset: string, i: number) => number | null;   // en la moneda pedida
  fxAt: (i: number) => number;                            // unidades de la moneda por EUR
}): { points: IntradayPoint[]; totalPnl: number; twrPct: number } {
  const valueAt = (i: number) => valueHoldings(holdings[i], a => priceOf(a, i), fxAt(i)).value;
  const inflow = new Array<number>(instants.length).fill(0);
  const outflow = new Array<number>(instants.length).fill(0);
  for (const f of flows) {
    // Tramo (instants[i-1], instants[i]] que contiene el flujo.
    const i = instants.findIndex((t, k) => k > 0 && f.at > instants[k - 1] && f.at <= t);
    if (i <= 0) continue;
    const price = f.asset === 'EUR' ? fxAt(i) : priceOf(f.asset, i);
    if (price === null) continue;
    const amount = Math.abs(f.quantity) * price;
    if (f.quantity > 0) inflow[i] += amount; else outflow[i] += amount;
  }
  const valuations: DayValuation[] = instants.slice(1).map((t, k) => ({
    date: new Date(t).toISOString(), value: valueAt(k + 1), inflow: inflow[k + 1], outflow: outflow[k + 1],
    netCapitalFlow: 0, complete: true, live: k + 1 === instants.length - 1,
  }));
  const base = valueAt(0);
  const { days, totalPnl, twrPct } = computeDailyPnl(base, valuations);
  let cumulative = 0;
  const points: IntradayPoint[] = [
    { at: new Date(instants[0]).toISOString(), value: Math.round(base * 100) / 100, pnl: 0, pct: 0, live: false },
    ...days.map(d => {
      cumulative += d.pnl;
      return { at: d.date, value: d.value, pnl: Math.round(cumulative * 100) / 100, pct: d.cumulativePct, live: d.live };
    }),
  ];
  return { points, totalPnl, twrPct };
}

async function mapPool<T, R>(items: readonly T[], size: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, async () => {
    while (next < items.length) { const i = next++; out[i] = await fn(items[i]); }
  }));
  return out;
}

export async function getIntradayPnl(currency: DisplayCurrency = 'EUR', now = Date.now()): Promise<IntradayResponse> {
  const instants = intradayInstants(now);
  const [events, allFlows] = await Promise.all([loadPositionEvents(), loadCapitalFlows()]);
  const holdings = holdingsAtInstants(events, instants);
  const flows = allFlows.filter(f => f.at > instants[0] && f.at <= now);

  const assets = new Set<string>();
  for (const h of holdings) for (const a of h.keys()) if (a !== 'EUR') assets.add(priceAsset(a));
  for (const f of flows) if (f.asset !== 'EUR') assets.add(priceAsset(f.asset));
  if (currency === 'USD') assets.add('USDT');

  const live = getAllLivePrices();
  const list = [...assets];
  const series = await mapPool(list, CONCURRENCY, a => quarterHourPricesEur(a, instants[0], now));
  const table = new Map<string, Array<number | null>>();
  const approximate: string[] = [];
  list.forEach((asset, k) => {
    if (!series[k] || series[k]!.size === 0) approximate.push(asset);
    table.set(asset, pricesAtInstants(instants, series[k], live.get(asset)));
  });

  const usdt = table.get('USDT');
  const fxAt = (i: number) => {
    if (currency === 'EUR') return 1;
    const rate = usdt?.[i];
    return rate && rate > 0 ? 1 / rate : 0;
  };
  const priceOf = (asset: string, i: number) => {
    const eur = table.get(priceAsset(asset))?.[i] ?? null;
    return eur === null ? null : eur * fxAt(i);
  };

  const { points, totalPnl, twrPct } = buildIntradaySeries({ instants, holdings, flows, priceOf, fxAt });
  return {
    currency, from: new Date(instants[0]).toISOString(), to: new Date(now).toISOString(), stepMinutes: 15,
    totalPnl, twrPct, approximate: approximate.filter(a => a !== 'USDT' || currency === 'USD').sort(), points,
  };
}
