import { usdPerEurSql } from '../fiat/displayCurrency';
import { filteredValuedCtes, groupingEnabled } from './historyQuery';
import type { HistoryFilters } from './listFilters';
import {
  BUY_TYPES, FEE_TYPES, FIAT_ASSETS, INCOME_TYPES, INVESTMENT_TYPES, OTHER_OUT_TYPES, SELL_TYPES, TRANSFER_TYPES, sqlList,
} from './operationGroups';
import { chartPeriod, todayIn, type ChartPeriod } from './statsPeriod';

// Estadísticas del Historial sobre lo filtrado (#376): tarjetas, gráfico de
// actividad por mes o año (número y valor por categoría) y rankings de
// activos y comisiones. Los mismos CTEs que la lista: «Operaciones» cuenta las
// filas visibles (#371) y las comisiones, todas las cobradas en lo filtrado.
// Importes en EUR y USD (con el tipo de su fecha; 0 si no hay tipo, como
// hasta ahora) para que el cambio de moneda no pida nada nuevo.

export const CATEGORIES = ['compras', 'ventas', 'otras_salidas', 'ingresos', 'transferencias', 'otros'] as const;
export type Category = typeof CATEGORIES[number];

/** Importe en ambas monedas. */
export interface Money { EUR: number; USD: number }
type ByCategory = Record<Category, number>;

export interface HistoryStats {
  totals: {
    ops: number; unique_assets: number; manual: number
    fiat_buys: number; invested: Money
    sells: number; sold: Money
    income_ops: number; income: Money; income_sin_valor: number
    fee_ops: number; fees: Money; fees_sin_valor: number
  }
  chart: ChartPeriod & { buckets: { periodo: string; ops: ByCategory; valor: { EUR: ByCategory; USD: ByCategory } }[] }
  /** Rankings: sobre lo filtrado con fechas; sin ellas, el último año. */
  rankings_periodo: 'filtrado' | 'ultimo_anio'
  top_assets: { asset: string; ops: number; volume: Money }[]
  fees_by_asset: { asset: string; ops: number; amount: number; value: Money }[]
}

/** Lo mínimo para consultar: el `db` de la app, un Pool o un cliente. */
type Queryable = { query: (text: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> };

const INVESTED = `(operation_type IN ${sqlList(INVESTMENT_TYPES)} AND cost_asset IN ${sqlList(FIAT_ASSETS)})`;
const CATEGORY = `CASE
  WHEN operation_type IN ${sqlList(BUY_TYPES)} THEN 'compras'
  WHEN operation_type IN ${sqlList(SELL_TYPES)} THEN 'ventas'
  WHEN operation_type IN ${sqlList(OTHER_OUT_TYPES)} THEN 'otras_salidas'
  WHEN operation_type IN ${sqlList(INCOME_TYPES)} THEN 'ingresos'
  WHEN operation_type IN ${sqlList(TRANSFER_TYPES)} THEN 'transferencias'
  ELSE 'otros' END`;

const num = (v: unknown) => (v === null || v === undefined ? 0 : Number(v));
const money = (eur: unknown, usd: unknown): Money => ({ EUR: num(eur), USD: num(usd) });
const emptyCategories = (): ByCategory => ({ compras: 0, ventas: 0, otras_salidas: 0, ingresos: 0, transferencias: 0, otros: 0 });

export async function getHistoryStats(db: Queryable, f: HistoryFilters, tz: string, now = new Date()): Promise<HistoryStats> {
  const grouped = groupingEnabled(f);
  const { ctes, params } = filteredValuedCtes(f, tz, grouped);
  const period = chartPeriod(f, todayIn(tz, now));
  const datesFiltered = !!(f.date_from || f.date_to);
  const all = [...params, tz, period.from, period.to];
  const [tzP, fromP, toP] = [all.length - 2, all.length - 1, all.length].map(i => `$${i}`);
  const unit = period.granularity;
  const fmt = unit === 'year' ? 'YYYY' : 'YYYY-MM';
  const recent = datesFiltered ? 'TRUE' : `timestamp >= NOW() - INTERVAL '1 year'`;

  const { rows } = await db.query(
    `WITH ${ctes},
     vt AS MATERIALIZED (
       SELECT v.id, v.operation_type, v.timestamp, v.asset, v.amount, v.cost_asset, v.fee_asset, v.fee_amount,
         v.manually_added, v.value_eur, v.fee_value_eur,
         COALESCE(${usdPerEurSql('v.timestamp')}, 0) AS usd,
         ${CATEGORY} AS cat,
         DATE_TRUNC('${unit}', v.timestamp AT TIME ZONE ${tzP}) AS bucket,
         ${grouped ? 'EXISTS (SELECT 1 FROM visible s WHERE s.id = v.id)' : 'TRUE'} AS shown
       FROM filtered v
     ),
     shown AS (SELECT * FROM vt WHERE shown),
     -- Cada comisión cobrada: la de la columna fee de una operación y las filas FEE_*.
     fee_items AS (
       SELECT fee_asset AS asset, fee_amount AS amount, fee_value_eur AS eur, fee_value_eur * usd AS usd, timestamp
       FROM vt WHERE fee_asset IS NOT NULL AND fee_amount > 0 AND operation_type NOT IN ${sqlList(FEE_TYPES)}
       UNION ALL
       SELECT COALESCE(fee_asset, asset), COALESCE(fee_amount, ABS(amount)), value_eur, value_eur * usd, timestamp
       FROM vt WHERE operation_type IN ${sqlList(FEE_TYPES)}
     )
     SELECT
       (SELECT json_build_object(
          'ops',              COUNT(*),
          'unique_assets',    COUNT(DISTINCT asset),
          'manual',           COUNT(*) FILTER (WHERE manually_added),
          'fiat_buys',        COUNT(*) FILTER (WHERE ${INVESTED}),
          'invested_eur',     COALESCE(SUM(value_eur) FILTER (WHERE ${INVESTED}), 0),
          'invested_usd',     COALESCE(SUM(value_eur * usd) FILTER (WHERE ${INVESTED}), 0),
          'sells',            COUNT(*) FILTER (WHERE cat = 'ventas'),
          'sold_eur',         COALESCE(SUM(value_eur) FILTER (WHERE cat = 'ventas'), 0),
          'sold_usd',         COALESCE(SUM(value_eur * usd) FILTER (WHERE cat = 'ventas'), 0),
          'income_ops',       COUNT(*) FILTER (WHERE cat = 'ingresos'),
          'income_eur',       COALESCE(SUM(value_eur) FILTER (WHERE cat = 'ingresos'), 0),
          'income_usd',       COALESCE(SUM(value_eur * usd) FILTER (WHERE cat = 'ingresos'), 0),
          'income_sin_valor', COUNT(*) FILTER (WHERE cat = 'ingresos' AND value_eur IS NULL)
        ) FROM shown) AS totals,
       (SELECT json_build_object(
          'ops', COUNT(*), 'eur', COALESCE(SUM(eur), 0), 'usd', COALESCE(SUM(usd), 0),
          'sin_valor', COUNT(*) FILTER (WHERE eur IS NULL)
        ) FROM fee_items) AS fees,
       (SELECT COALESCE(json_agg(c ORDER BY c.periodo, c.cat), '[]') FROM (
          SELECT TO_CHAR(b.bucket, '${fmt}') AS periodo, s.cat, COUNT(s.id) AS ops,
            COALESCE(SUM(s.value_eur), 0) AS eur, COALESCE(SUM(s.value_eur * s.usd), 0) AS usd
          FROM generate_series(${fromP}::date::timestamp, ${toP}::date::timestamp, INTERVAL '1 ${unit}') AS b(bucket)
          LEFT JOIN shown s ON s.bucket = b.bucket
          GROUP BY b.bucket, s.cat
        ) c) AS chart,
       (SELECT COALESCE(json_agg(a ORDER BY a.ops DESC, a.asset), '[]') FROM (
          SELECT asset, COUNT(*) AS ops, COALESCE(SUM(value_eur), 0) AS eur, COALESCE(SUM(value_eur * usd), 0) AS usd
          FROM shown WHERE cat IN ('compras', 'ventas') AND ${recent}
          GROUP BY asset ORDER BY ops DESC, asset LIMIT 10
        ) a) AS top_assets,
       (SELECT COALESCE(json_agg(x ORDER BY x.eur DESC, x.asset), '[]') FROM (
          SELECT asset, COUNT(*) AS ops, COALESCE(SUM(amount), 0) AS amount,
            COALESCE(SUM(eur), 0) AS eur, COALESCE(SUM(usd), 0) AS usd
          FROM fee_items WHERE ${recent}
          GROUP BY asset ORDER BY eur DESC, asset LIMIT 6
        ) x) AS fees_by_asset`,
    all,
  );
  const r = rows[0] as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  const t = r.totals;

  // Una fila por periodo, con todas las categorías (las vacías a 0).
  const buckets = new Map<string, HistoryStats['chart']['buckets'][number]>();
  for (const c of r.chart as { periodo: string; cat: Category | null; ops: number; eur: number; usd: number }[]) {
    let b = buckets.get(c.periodo);
    if (!b) {
      b = { periodo: c.periodo, ops: emptyCategories(), valor: { EUR: emptyCategories(), USD: emptyCategories() } };
      buckets.set(c.periodo, b);
    }
    if (c.cat) {
      b.ops[c.cat] = num(c.ops);
      b.valor.EUR[c.cat] = num(c.eur);
      b.valor.USD[c.cat] = num(c.usd);
    }
  }

  return {
    totals: {
      ops: num(t.ops), unique_assets: num(t.unique_assets), manual: num(t.manual),
      fiat_buys: num(t.fiat_buys), invested: money(t.invested_eur, t.invested_usd),
      sells: num(t.sells), sold: money(t.sold_eur, t.sold_usd),
      income_ops: num(t.income_ops), income: money(t.income_eur, t.income_usd), income_sin_valor: num(t.income_sin_valor),
      fee_ops: num(r.fees.ops), fees: money(r.fees.eur, r.fees.usd), fees_sin_valor: num(r.fees.sin_valor),
    },
    chart: { ...period, buckets: [...buckets.values()] },
    rankings_periodo: datesFiltered ? 'filtrado' : 'ultimo_anio',
    top_assets: (r.top_assets as Record<string, unknown>[]).map(a => ({ asset: String(a.asset), ops: num(a.ops), volume: money(a.eur, a.usd) })),
    fees_by_asset: (r.fees_by_asset as Record<string, unknown>[]).map(x => ({
      asset: String(x.asset), ops: num(x.ops), amount: num(x.amount), value: money(x.eur, x.usd),
    })),
  };
}
