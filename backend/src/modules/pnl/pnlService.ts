import { loadPositionEvents, holdingsAtInstants } from './positions';
import { loadCapitalFlows } from './capitalFlows';
import { computeDailyPnl, valueHoldings, type DayPnl, type DayValuation } from './dailyPnl';
import {
  daysBetween, getCachedCloses, madridCloseInstant, madridDateOf, prefetchCloseRange,
} from '../prices/closePrices';
import { PRICE_ALIASES } from '../prices/priceAliases';
import { getAllLivePrices } from '../prices/liveFeed';
import type { DisplayCurrency } from '../fiat/displayCurrency';

// Orquestación del P&L diario (#165): tenencias al cierre de cada día local
// (Europe/Madrid), precios de cierre en caché, flujos de capital y día en
// curso con precios en vivo. Responde con lo que haya en caché; si faltan
// cierres, marca `refreshing` y los descarga en segundo plano.

export interface PnlResponse {
  currency: DisplayCurrency;
  from: string;
  to: string;
  timezone: 'Europe/Madrid';
  refreshing: boolean;
  totalPnl: number;
  twrPct: number;    // rentabilidad ponderada en el tiempo del rango
  dietzPct: number;  // Dietz modificado del rango
  peakCapitalPct: number; // P&L sobre el máximo capital neto aportado, sin margen (periodo completo)
  days: DayPnl[];
  today: LiveDayBase | null; // base del día en curso si está en el rango (#213)
}

/**
 * Base para recalcular el P&L de hoy en el cliente con los precios en vivo
 * (#213): el cliente aplica la misma fórmula que computeDailyPnl con cada
 * tick del WebSocket, en lugar de esperar a la siguiente consulta.
 * Cantidades por activo de precio (alias resueltos; 'EUR' son euros) y
 * precios en EUR que usó el servidor, como respaldo de los que falten.
 */
export interface LiveDayBase {
  date: string;
  previousValue: number;            // valor al cierre de ayer, en la moneda de la respuesta
  holdings: Record<string, number>; // tenencias en este instante
  flows: Array<{ asset: string; quantity: number }>; // flujos de capital de hoy (+ entrada, − salida)
  pricesEur: Record<string, number>;
}

export function previousDay(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d - 1)).toISOString().slice(0, 10);
}

const priceAsset = (asset: string) => PRICE_ALIASES[asset] ?? asset;

export async function getDailyPnl(
  query: { from?: string; to?: string; currency?: DisplayCurrency } = {},
): Promise<PnlResponse> {
  const currency: DisplayCurrency = query.currency ?? 'EUR';
  const now = Date.now();
  const today = madridDateOf(now);
  const [events, flows] = await Promise.all([loadPositionEvents(), loadCapitalFlows()]);

  const to = query.to ?? today;
  const firstActivity = events.length > 0 ? madridDateOf(events.reduce((min, e) => Math.min(min, e.at), Infinity)) : to;
  const from = !query.from || query.from < firstActivity ? (firstActivity <= to ? firstActivity : to) : query.from;
  const empty: PnlResponse = { currency, from, to, timezone: 'Europe/Madrid', refreshing: false, totalPnl: 0, twrPct: 0, dietzPct: 0, peakCapitalPct: 0, days: [], today: null };
  if (events.length === 0 || from > to) return empty;

  // Día anterior (base) + días pedidos. El día de hoy se valora en este instante.
  const allDays = [previousDay(from), ...daysBetween(from, to)];
  const instants = allDays.map(d => (d === today ? now : madridCloseInstant(d).getTime()));
  const holdings = holdingsAtInstants(events, instants);

  // ── Precios: caché de cierres, arrastre del último conocido y vivo para hoy ──
  const assets = new Set<string>();
  for (const h of holdings) for (const a of h.keys()) if (a !== 'EUR') assets.add(priceAsset(a));
  for (const f of flows) if (f.asset !== 'EUR') assets.add(priceAsset(f.asset));
  // En USD hace falta el cierre de USDT de todos los días: es el tipo USD por EUR.
  if (currency === 'USD') assets.add('USDT');
  const cache = await getCachedCloses([...assets], allDays[0], to);
  const live = getAllLivePrices();

  // Por activo: precio de cada día (exacto o arrastrado) y días aún no descargados.
  const pending = new Map<string, { from: string; to: string }>();
  // Solo se descargan días en que el activo estaba en cartera o tuvo un flujo.
  const markPending = (asset: string, day: string) => {
    const range = pending.get(asset);
    pending.set(asset, { from: range && range.from < day ? range.from : day, to: range && range.to > day ? range.to : day });
  };
  const priceTable = new Map<string, Array<number | null>>();
  const pendingDay = new Array<boolean>(allDays.length).fill(false);
  for (const asset of assets) {
    const closes = cache.get(asset);
    let last: number | null = null;
    priceTable.set(asset, allDays.map((day, i) => {
      if (day === today) {
        const lp = live.get(asset);
        return lp && lp > 0 ? lp : last;
      }
      const cached = closes?.get(day);
      if (cached === undefined) {
        if (heldOn(holdings[i], asset) || (currency === 'USD' && asset === 'USDT')) { markPending(asset, day); pendingDay[i] = true; }
        return last;
      }
      if (cached > 0) last = cached;
      return last;
    }));
  }
  // Moneda de visualización (#175): en USD cada importe en EUR del día i se
  // divide por el precio de 1 USDT en EUR de ese mismo cierre (o en vivo hoy).
  const usdtEur = priceTable.get('USDT');
  const fxAt = (i: number): number | null => {
    if (currency === 'EUR') return 1;
    const rate = usdtEur?.[i];
    return rate && rate > 0 ? 1 / rate : null;
  };
  const priceOf = (asset: string, i: number) => {
    const eur = priceTable.get(priceAsset(asset))?.[i] ?? null;
    const fx = fxAt(i);
    return eur === null || fx === null ? null : eur * fx;
  };
  for (let i = 0; i < allDays.length; i++) if (fxAt(i) === null) pendingDay[i] = true;

  // ── Flujos de capital agrupados por día (cierre anterior, cierre] ──
  const inflow = new Array<number>(allDays.length).fill(0);
  const outflow = new Array<number>(allDays.length).fill(0);
  const netCapitalFlow = new Array<number>(allDays.length).fill(0);
  const capitalIn = new Array<number>(allDays.length).fill(0);
  const capitalOut = new Array<number>(allDays.length).fill(0);
  const todayIdx = allDays[allDays.length - 1] === today ? allDays.length - 1 : -1;
  const todayFlows: LiveDayBase['flows'] = [];
  for (const f of flows) {
    const i = dayIndexFor(f.at, instants);
    if (i <= 0) continue; // anterior al rango o del propio día base
    if (i === todayIdx) todayFlows.push({ asset: f.asset === 'EUR' ? 'EUR' : priceAsset(f.asset), quantity: f.quantity });
    const price = f.asset === 'EUR' ? fxAt(i) : priceOf(f.asset, i);
    if (f.asset !== 'EUR' && allDays[i] !== today && cache.get(priceAsset(f.asset))?.get(allDays[i]) === undefined) {
      markPending(priceAsset(f.asset), allDays[i]);
      pendingDay[i] = true;
    }
    if (price === null) { pendingDay[i] = true; continue; }
    const eur = Math.abs(f.quantity) * price;
    if (f.quantity > 0) inflow[i] += eur; else outflow[i] += eur;
    if (f.kind === 'capital') {
      netCapitalFlow[i] += f.quantity > 0 ? eur : -eur;
      if (f.quantity > 0) capitalIn[i] += eur; else capitalOut[i] += eur;
    }
  }

  // ── Valoración y P&L ──
  const valueAt = (i: number) => valueHoldings(holdings[i], a => priceOf(a, i), fxAt(i) ?? 0).value;
  const valuations: DayValuation[] = allDays.slice(1).map((date, k) => {
    const i = k + 1;
    return {
      date, value: valueAt(i), inflow: inflow[i], outflow: outflow[i], netCapitalFlow: netCapitalFlow[i],
      capitalIn: capitalIn[i], capitalOut: capitalOut[i],
      complete: !pendingDay[i], live: date === today,
    };
  });
  const { days, totalPnl, twrPct, dietzPct, peakCapitalPct } = computeDailyPnl(valueAt(0), valuations);

  const refreshing = pending.size > 0;
  if (refreshing) schedulePrefetch(pending);
  const liveDay = todayIdx > 0 ? liveDayBase(today, valueAt(todayIdx - 1), holdings[todayIdx], todayFlows, priceTable, todayIdx) : null;
  return { currency, from, to, timezone: 'Europe/Madrid', refreshing, totalPnl, twrPct, dietzPct, peakCapitalPct, days, today: liveDay };
}

function liveDayBase(
  date: string,
  previousValue: number,
  held: ReadonlyMap<string, number>,
  flows: LiveDayBase['flows'],
  priceTable: ReadonlyMap<string, Array<number | null>>,
  index: number,
): LiveDayBase {
  const holdings: Record<string, number> = {};
  for (const [asset, qty] of held) {
    if (qty === 0) continue;
    const key = asset === 'EUR' ? 'EUR' : priceAsset(asset);
    holdings[key] = (holdings[key] ?? 0) + qty;
  }
  const pricesEur: Record<string, number> = {};
  for (const asset of new Set([...Object.keys(holdings), ...flows.map(f => f.asset), 'USDT'])) {
    const price = priceTable.get(asset)?.[index];
    if (asset !== 'EUR' && price && price > 0) pricesEur[asset] = price;
  }
  return { date, previousValue: Math.round(previousValue * 100) / 100, holdings, flows, pricesEur };
}

function heldOn(h: ReadonlyMap<string, number>, asset: string): boolean {
  for (const [a, qty] of h) if (priceAsset(a) === asset && qty !== 0) return true;
  return false;
}

// Índice del primer instante ≥ at (búsqueda binaria; los instantes son crecientes).
function dayIndexFor(at: number, instants: readonly number[]): number {
  let lo = 0, hi = instants.length - 1;
  if (at > instants[hi]) return -1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (instants[mid] >= at) hi = mid; else lo = mid + 1;
  }
  return lo;
}

// ── Precarga en segundo plano, una a la vez y con enfriamiento ─────────────
let prefetching: Promise<void> | null = null;
let lastPrefetchAt = 0;
const PREFETCH_COOLDOWN_MS = 60_000;

function schedulePrefetch(ranges: ReadonlyMap<string, { from: string; to: string }>): void {
  if (prefetching || Date.now() - lastPrefetchAt < PREFETCH_COOLDOWN_MS) return;
  lastPrefetchAt = Date.now();
  const work = [...ranges];
  prefetching = (async () => {
    for (const [asset, { from, to }] of work) {
      await prefetchCloseRange(asset, from, to).catch(e =>
        console.error(`[PNL] Precarga de cierres de ${asset} fallida:`, (e as Error).message));
    }
  })().finally(() => { prefetching = null; });
}

/** Solo para tests: espera a que termine la precarga en curso. */
export function waitForPrefetch(): Promise<void> {
  return prefetching ?? Promise.resolve();
}
