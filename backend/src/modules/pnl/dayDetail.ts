import { getDailyPnl, previousDay } from './pnlService';
import { loadPositionEvents, holdingsAtInstants } from './positions';
import { getCachedCloses, madridCloseInstant, madridDateOf } from '../prices/closePrices';
import { PRICE_ALIASES } from '../prices/priceAliases';
import { getAllLivePrices } from '../prices/liveFeed';
import type { DisplayCurrency } from '../fiat/displayCurrency';

// Detalle de un día del calendario de P&L (#216): cifras del día y reparto
// del P&L entre activos por efecto precio. Para cada activo, la cantidad que
// había al cierre del día anterior por la variación de su precio en el día.
// Lo que no explica el precio (compras y ventas del propio día, comisiones,
// activos sin cierre) va en `other`, de modo que la suma cuadra con el P&L.

export interface Contribution { asset: string; pnl: number }

export interface DayDetail {
  date: string;
  currency: DisplayCurrency;
  live: boolean;
  complete: boolean;
  value: number;
  pnl: number;
  pct: number | null;
  inflow: number;
  outflow: number;
  contributions: Contribution[];  // ordenadas de mayor a menor aportación
  other: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const priceAsset = (asset: string) => PRICE_ALIASES[asset] ?? asset;

/**
 * Efecto precio por activo en la moneda pedida. `price` da el precio en EUR al
 * cierre anterior ('prev') o del día ('day'); `fx`, unidades de la moneda por
 * EUR en cada momento. En USD el saldo en EUR también varía con el tipo.
 * Los activos sin alguno de los dos precios se omiten (quedan en el resto).
 */
export function priceContributions(
  holdings: ReadonlyMap<string, number>,
  price: (asset: string, when: 'prev' | 'day') => number | null,
  fx: { prev: number; day: number },
): Contribution[] {
  const byAsset = new Map<string, number>();
  for (const [asset, qty] of holdings) {
    if (qty === 0) continue;
    const key = asset === 'EUR' ? 'EUR' : priceAsset(asset);
    let delta: number | null;
    if (key === 'EUR') delta = fx.day - fx.prev;
    else {
      const prev = price(key, 'prev');
      const day = price(key, 'day');
      delta = prev === null || day === null ? null : day * fx.day - prev * fx.prev;
    }
    if (delta === null) continue;
    byAsset.set(key, (byAsset.get(key) ?? 0) + qty * delta);
  }
  return [...byAsset]
    .map(([asset, pnl]) => ({ asset, pnl: round2(pnl) }))
    .filter(c => Math.abs(c.pnl) >= 0.01)
    .sort((a, b) => b.pnl - a.pnl);
}

/** Detalle del día; null si no hay actividad ese día (anterior a la primera operación). */
export async function getDayDetail(date: string, currency: DisplayCurrency = 'EUR', now = Date.now()): Promise<DayDetail | null> {
  const today = madridDateOf(now);
  const [daily, events] = await Promise.all([getDailyPnl({ from: date, to: date, currency }), loadPositionEvents()]);
  const day = daily.days.find(d => d.date === date);
  if (!day) return null;

  const prevDay = previousDay(date);
  const [holdings] = holdingsAtInstants(events, [madridCloseInstant(prevDay).getTime()]);
  const assets = new Set<string>();
  for (const a of holdings.keys()) if (a !== 'EUR') assets.add(priceAsset(a));
  if (currency === 'USD') assets.add('USDT');
  const closes = await getCachedCloses([...assets], prevDay, date);
  const live = getAllLivePrices();

  const price = (asset: string, when: 'prev' | 'day'): number | null => {
    const key = priceAsset(asset);
    if (when === 'day' && date === today) {
      const lp = live.get(key);
      if (lp && lp > 0) return lp;
    }
    const p = closes.get(key)?.get(when === 'prev' ? prevDay : date);
    return p !== undefined && p > 0 ? p : null;
  };
  const fxAt = (when: 'prev' | 'day'): number | null => {
    if (currency === 'EUR') return 1;
    const usdt = price('USDT', when);
    return usdt ? 1 / usdt : null;
  };
  const fxPrev = fxAt('prev');
  const fxDay = fxAt('day');
  const contributions = fxPrev && fxDay ? priceContributions(holdings, price, { prev: fxPrev, day: fxDay }) : [];
  const explained = contributions.reduce((s, c) => s + c.pnl, 0);

  return {
    date, currency, live: day.live, complete: day.complete,
    value: day.value, pnl: day.pnl, pct: day.pct, inflow: day.inflow, outflow: day.outflow,
    contributions, other: round2(day.pnl - explained),
  };
}
