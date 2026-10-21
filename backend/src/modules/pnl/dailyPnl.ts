// Cálculo puro del P&L diario y de la rentabilidad acumulada (#165).
//
// P&L(d)  = V(d) − V(d−1) − (entradas(d) − salidas(d))
// %(d)    = P&L(d) / (V(d−1) + entradas(d))        (null si la base no llega al
//           umbral de capital ínfimo, ver minBaseFor: con una cartera casi vacía
//           el % no es representativo y hundiría el TWR para siempre, #353)
// TWR     = Π(1 + %(d)/100) − 1                    (rentabilidad ponderada en el tiempo)
// Dietz   = P&L acumulado / (V0 + Σ Fₖ · (m − k)/m)  (Dietz modificado hasta el día m:
//           cada flujo neto Fₖ pesa por la fracción del periodo que estuvo invertido).
//           A diferencia del TWR, no se hunde para siempre tras una pérdida total
//           puntual.
// Capital = P&L acumulado / máximo capital neto aportado hasta ese día (V0 +
//           Σ flujos de capital netos, sin margen). Se usa el máximo y no el
//           saldo actual: tras retirar casi todo, dividir por lo que queda
//           dispararía el % (-12,93 € sobre 12,94 € restantes = -99,98 %, cuando
//           se perdió un 20 % de lo aportado). Es el % de "Todo" (#166).
//
// Los flujos de capital se valoran al mismo precio que la cartera ese día,
// así que un depósito o una retirada no altera el P&L del día.

export interface DayValuation {
  date: string;      // YYYY-MM-DD (día local Europe/Madrid)
  value: number;     // valor de la cartera al cierre (o en vivo si es hoy)
  inflow: number;    // entradas de capital del día, en EUR (≥ 0)
  outflow: number;   // salidas de capital del día, en EUR (≥ 0)
  netCapitalFlow: number; // entradas − salidas sin contar el margen, en EUR
  // Entradas y salidas de capital propio por separado (sin margen), para que
  // un depósito y una retirada del mismo día no se compensen en los marcadores.
  capitalIn?: number;
  capitalOut?: number;
  complete: boolean; // false si falta algún precio de cierre (aún descargándose)
  live: boolean;     // día en curso, con precios en vivo
}

export interface DayPnl extends DayValuation {
  capitalIn: number;
  capitalOut: number;
  pnl: number;
  pct: number | null;
  cumulativePct: number;       // TWR acumulado desde el inicio del rango
  cumulativeDietzPct: number;  // Dietz modificado acumulado desde el inicio del rango
  cumulativePeakCapitalPct: number; // P&L acumulado sobre el máximo capital neto aportado
}

// Umbral de capital ínfimo (#353): el % de un día (y el TWR, el Dietz y el %
// sobre capital) solo cuenta si la base llega al 1 % del valor máximo del
// periodo, con un mínimo absoluto de 1 en la moneda de la serie. Es el mismo
// criterio que minBase() del frontend (utils/evolutionSummary.ts). Antes era
// 1 € fijo: días con 5–10 € en cartera y caídas del 15 % hundían el TWR.
export const MIN_BASE_SHARE = 0.01;
export const MIN_BASE_ABS = 1;

/** Base mínima para que el % de un día cuente, según el valor máximo del periodo. */
export function minBaseFor(previousValue: number, days: readonly Pick<DayValuation, 'value'>[]): number {
  const peak = days.reduce((m, d) => Math.max(m, d.value), previousValue);
  return Math.max(MIN_BASE_ABS, peak * MIN_BASE_SHARE);
}
const round2 = (n: number) => Math.round(n * 100) / 100;
const round4 = (n: number) => Math.round(n * 10_000) / 10_000;

export function computeDailyPnl(
  previousValue: number,
  days: readonly DayValuation[],
): { days: DayPnl[]; totalPnl: number; twrPct: number; dietzPct: number; peakCapitalPct: number } {
  const threshold = minBaseFor(previousValue, days);
  let prev = previousValue;
  let growth = 1;
  let totalPnl = 0;
  let dietz = 0;
  let sumFlows = 0;           // Σ Fₖ
  let sumIndexedFlows = 0;    // Σ k · Fₖ
  let netCapital = previousValue;
  let peakCapital = previousValue;
  let peakCapitalPct = 0;
  const result: DayPnl[] = [];

  for (const [index, day] of days.entries()) {
    const m = index + 1;
    const pnl = day.value - prev - (day.inflow - day.outflow);
    const base = prev + day.inflow;
    const pct = base >= threshold ? (pnl / base) * 100 : null;
    if (pct !== null) growth *= 1 + pct / 100;
    totalPnl += pnl;

    const netFlow = day.inflow - day.outflow;
    sumFlows += netFlow;
    sumIndexedFlows += m * netFlow;
    const dietzBase = previousValue + (m * sumFlows - sumIndexedFlows) / m;
    if (dietzBase >= threshold) dietz = (totalPnl / dietzBase) * 100;

    netCapital += day.netCapitalFlow;
    peakCapital = Math.max(peakCapital, netCapital);
    if (peakCapital >= threshold) peakCapitalPct = (totalPnl / peakCapital) * 100;

    result.push({
      ...day,
      value: round2(day.value),
      inflow: round2(day.inflow),
      outflow: round2(day.outflow),
      pnl: round2(pnl),
      pct: pct === null ? null : round4(pct),
      cumulativePct: round4((growth - 1) * 100),
      cumulativeDietzPct: round4(dietz),
      cumulativePeakCapitalPct: round4(peakCapitalPct),
      netCapitalFlow: round2(day.netCapitalFlow),
      capitalIn: round2(day.capitalIn ?? 0),
      capitalOut: round2(day.capitalOut ?? 0),
    });
    prev = day.value;
  }

  return {
    days: result, totalPnl: round2(totalPnl), twrPct: round4((growth - 1) * 100),
    dietzPct: round4(dietz), peakCapitalPct: round4(peakCapitalPct),
  };
}

/**
 * Valor de unas tenencias con una función de precio. EUR vale `eurPrice` (1 en
 * EUR; el tipo USD por EUR en USD). Los activos sin precio se excluyen y se
 * devuelven en `missing`.
 */
export function valueHoldings(
  holdings: ReadonlyMap<string, number>,
  priceOf: (asset: string) => number | null,
  eurPrice = 1,
): { value: number; missing: string[] } {
  let value = 0;
  const missing: string[] = [];
  for (const [asset, qty] of holdings) {
    if (asset === 'EUR') { value += qty * eurPrice; continue; }
    const price = priceOf(asset);
    if (price === null) { missing.push(asset); continue; }
    value += qty * price;
  }
  return { value, missing };
}
