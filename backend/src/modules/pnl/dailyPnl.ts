// Cálculo puro del P&L diario y de la rentabilidad acumulada (#165).
//
// P&L(d)  = V(d) − V(d−1) − (entradas(d) − salidas(d))
// %(d)    = P&L(d) / (V(d−1) + entradas(d))        (null si la base es < 1 €:
//           con una cartera casi vacía el % no es representativo y dispararía el TWR)
// TWR     = Π(1 + %(d)/100) − 1                    (rentabilidad ponderada en el tiempo)
// Dietz   = P&L acumulado / (V0 + Σ Fₖ · (m − k)/m)  (Dietz modificado hasta el día m:
//           cada flujo neto Fₖ pesa por la fracción del periodo que estuvo invertido).
//           A diferencia del TWR, no se hunde para siempre tras una pérdida total
//           puntual; se usa para periodos largos ("Todo").
//
// Los flujos de capital se valoran al mismo precio que la cartera ese día,
// así que un depósito o una retirada no altera el P&L del día.

export interface DayValuation {
  date: string;      // YYYY-MM-DD (día local Europe/Madrid)
  value: number;     // valor de la cartera al cierre (o en vivo si es hoy)
  inflow: number;    // entradas de capital del día, en EUR (≥ 0)
  outflow: number;   // salidas de capital del día, en EUR (≥ 0)
  complete: boolean; // false si falta algún precio de cierre (aún descargándose)
  live: boolean;     // día en curso, con precios en vivo
}

export interface DayPnl extends DayValuation {
  pnl: number;
  pct: number | null;
  cumulativePct: number;       // TWR acumulado desde el inicio del rango
  cumulativeDietzPct: number;  // Dietz modificado acumulado desde el inicio del rango
}

const MIN_BASE_EUR = 1;
const round2 = (n: number) => Math.round(n * 100) / 100;
const round4 = (n: number) => Math.round(n * 10_000) / 10_000;

export function computeDailyPnl(
  previousValue: number,
  days: readonly DayValuation[],
): { days: DayPnl[]; totalPnl: number; twrPct: number; dietzPct: number } {
  let prev = previousValue;
  let growth = 1;
  let totalPnl = 0;
  let dietz = 0;
  let sumFlows = 0;           // Σ Fₖ
  let sumIndexedFlows = 0;    // Σ k · Fₖ
  const result: DayPnl[] = [];

  for (const [index, day] of days.entries()) {
    const m = index + 1;
    const pnl = day.value - prev - (day.inflow - day.outflow);
    const base = prev + day.inflow;
    const pct = base >= MIN_BASE_EUR ? (pnl / base) * 100 : null;
    if (pct !== null) growth *= 1 + pct / 100;
    totalPnl += pnl;

    const netFlow = day.inflow - day.outflow;
    sumFlows += netFlow;
    sumIndexedFlows += m * netFlow;
    const dietzBase = previousValue + (m * sumFlows - sumIndexedFlows) / m;
    if (dietzBase >= MIN_BASE_EUR) dietz = (totalPnl / dietzBase) * 100;

    result.push({
      ...day,
      value: round2(day.value),
      inflow: round2(day.inflow),
      outflow: round2(day.outflow),
      pnl: round2(pnl),
      pct: pct === null ? null : round4(pct),
      cumulativePct: round4((growth - 1) * 100),
      cumulativeDietzPct: round4(dietz),
    });
    prev = day.value;
  }

  return { days: result, totalPnl: round2(totalPnl), twrPct: round4((growth - 1) * 100), dietzPct: round4(dietz) };
}

/**
 * Valor de unas tenencias con una función de precio. EUR vale 1. Los activos
 * sin precio se excluyen y se devuelven en `missing`.
 */
export function valueHoldings(
  holdings: ReadonlyMap<string, number>,
  priceOf: (asset: string) => number | null,
): { value: number; missing: string[] } {
  let value = 0;
  const missing: string[] = [];
  for (const [asset, qty] of holdings) {
    if (asset === 'EUR') { value += qty; continue; }
    const price = priceOf(asset);
    if (price === null) { missing.push(asset); continue; }
    value += qty * price;
  }
  return { value, missing };
}
