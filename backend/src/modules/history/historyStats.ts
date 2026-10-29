import { usdPerEurSql } from '../fiat/displayCurrency';
import { filteredValuedCtes, groupingEnabled } from './historyQuery';
import type { HistoryFilters } from './listFilters';
import {
  BUY_TYPES, FEE_TYPES, FIAT_ASSETS, INCOME_TYPES, MARGIN_ACCOUNTS, OTHER_OUT_TYPES, SELL_TYPES, STABLECOINS, TRANSFER_TYPES, sqlList,
} from './operationGroups';
import { cardSql, marginSql, type SummaryCard } from './summaryCards';
import { feeInPriceSql } from './feeInPrice';
import { chartPeriod, todayIn, type ChartPeriod } from './statsPeriod';

// Estadísticas del Historial sobre lo filtrado (#376): tarjetas, gráfico de
// actividad por mes o año (número y valor por categoría) y rankings de
// activos y comisiones. Los mismos CTEs que la lista: «Operaciones» cuenta las
// filas visibles (#371) y las comisiones, todas las cobradas en lo filtrado.
// Importes en EUR y USD (con el tipo de su fecha; 0 si no hay tipo, como
// hasta ahora) para que el cambio de moneda no pida nada nuevo.
// Compras y ventas según el lado del fiat (#403): recibir fiat es una venta y
// entregarlo, una compra, aunque el exchange lo registre al revés (comprar EUR
// con cripto, vender EUR por USDC). Sin margen, las tarjetas, el gráfico y los
// rankings dejan fuera la operativa de las cuentas de margen. Qué suma cada
// tarjeta vive en summaryCards.ts, compartido con el filtro «Tarjeta» (#407).

export const CATEGORIES = ['compras', 'ventas', 'otras_salidas', 'ingresos', 'transferencias', 'otros'] as const;
export type Category = typeof CATEGORIES[number];

/** Importe en ambas monedas. */
export interface Money { EUR: number; USD: number }
type ByCategory = Record<Category, number>;

export interface HistoryStats {
  totals: {
    ops: number; unique_assets: number; manual: number
    fiat_buys: number; invested: Money
    /** Fiat recibido al vender cripto: Invertido menos esto es el neto. */
    recovered: Money
    sells: number; sold: Money
    /** Resultado (G/P) de las ventas según el FIFO. */
    sold_gp: Money
    /** Ventas por lo que se recibe a cambio. */
    sold_by_counterpart: Record<Counterpart, { ops: number; value: Money }>
    /** Stablecoin pasada a fiat (#407): no se suma a Ventas. */
    stable_to_fiat: { ops: number; value: Money }
    /** Fiat retirado al banco o a tarjeta y depositado (#407). */
    withdrawn_ops: number; withdrawn: Money; deposited: Money
    income_ops: number; income: Money; income_sin_valor: number
    fee_ops: number; fees: Money; fees_sin_valor: number
    /** De ellas, incluidas en el coste de la compra por el exchange (#415). */
    fees_included: { ops: number; value: Money }
    /** Con la comisión incluida en el precio, sin cifra en el CSV (#431): no suman. */
    fees_in_price_ops: number
  }
  chart: ChartPeriod & { buckets: { periodo: string; ops: ByCategory; valor: { EUR: ByCategory; USD: ByCategory } }[] }
  /** Importe de cada tarjeta por periodo del gráfico (#407), para sus mini gráficas. */
  series: { periodo: string; valor: Record<SummaryCard, Money> }[]
  /** Rankings: sobre lo filtrado con fechas; sin ellas, el último año. */
  rankings_periodo: 'filtrado' | 'ultimo_anio'
  top_assets: { asset: string; ops: number; volume: Money }[]
  fees_by_asset: { asset: string; ops: number; amount: number; value: Money }[]
  /** Operativa de margen (#403): si se incluye y cuántas operaciones (y ventas) son de margen. */
  margin: { included: boolean; ops: number; sells: number }
}

export const COUNTERPARTS = ['fiat', 'stablecoin', 'cripto'] as const;
export type Counterpart = typeof COUNTERPARTS[number];

/** Lo mínimo para consultar: el `db` de la app, un Pool o un cliente. */
type Queryable = { query: (text: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> };

const S = cardSql('');
const FIAT = sqlList(FIAT_ASSETS);
/** Qué se recibe en una venta: el fiat comprado o la contrapartida. */
const COUNTERPART = `CASE
  WHEN asset IN ${FIAT} OR cost_asset IN ${FIAT} THEN 'fiat'
  WHEN cost_asset IN ${sqlList(STABLECOINS)} THEN 'stablecoin'
  ELSE 'cripto' END`;
const CATEGORY = `CASE
  WHEN ${S.stableToFiat} THEN 'otros'
  WHEN ${S.fiatBought} THEN 'ventas'
  WHEN ${S.fiatSold} THEN 'compras'
  WHEN operation_type IN ${sqlList(BUY_TYPES)} THEN 'compras'
  WHEN operation_type IN ${sqlList(SELL_TYPES)} THEN 'ventas'
  WHEN operation_type IN ${sqlList(OTHER_OUT_TYPES)} THEN 'otras_salidas'
  WHEN operation_type IN ${sqlList(INCOME_TYPES)} THEN 'ingresos'
  WHEN operation_type IN ${sqlList(TRANSFER_TYPES)} THEN 'transferencias'
  ELSE 'otros' END`;

const num = (v: unknown) => (v === null || v === undefined ? 0 : Number(v));
const money = (eur: unknown, usd: unknown): Money => ({ EUR: num(eur), USD: num(usd) });
const emptyCategories = (): ByCategory => ({ compras: 0, ventas: 0, otras_salidas: 0, ingresos: 0, transferencias: 0, otros: 0 });

export async function getHistoryStats(
  db: Queryable, f: HistoryFilters, tz: string, now = new Date(), includeMargin = true,
): Promise<HistoryStats> {
  const grouped = groupingEnabled(f);
  const { ctes, params } = filteredValuedCtes(f, tz, grouped);
  const period = chartPeriod(f, todayIn(tz, now));
  const datesFiltered = !!(f.date_from || f.date_to);
  const all = [...params, tz, period.from, period.to];
  const [tzP, fromP, toP] = [all.length - 2, all.length - 1, all.length].map(i => `$${i}`);
  // Con filtro de wallet (#395), solo las comisiones que pagó ella: una entrada
  // desde otra wallet propia trae la comisión pagada en origen.
  let paidHere = '';
  if (f.wallet_id) { all.push(f.wallet_id); paidHere = `AND wallet_id = $${all.length}`; }
  // Margen (#403): sus cuentas, los préstamos y lo que entra o sale de una wallet de margen.
  all.push([...MARGIN_ACCOUNTS]);
  const marginAccountsP = `$${all.length}::text[]`;
  const notMargin = includeMargin ? 'TRUE' : 'NOT is_margin';
  const unit = period.granularity;
  const fmt = unit === 'year' ? 'YYYY' : 'YYYY-MM';
  const recent = datesFiltered ? 'TRUE' : `timestamp >= NOW() - INTERVAL '1 year'`;

  const { rows } = await db.query(
    `WITH ${ctes},
     vt AS MATERIALIZED (
       SELECT v.id, v.operation_type, v.timestamp, v.asset, v.amount, v.cost_asset, v.fee_asset, v.fee_amount, v.wallet_id,
         v.included_fee_asset, v.included_fee_amount,
         v.manually_added, v.value_eur, v.fee_value_eur,
         COALESCE(${usdPerEurSql('v.timestamp')}, 0) AS usd,
         ${CATEGORY} AS cat,
         ${S.invested} AS invested,
         ${S.recovered} AS recovered,
         ${S.sale} AS is_sale,
         ${S.stableToFiat} AS stable_to_fiat,
         ${S.withdrawn} AS withdrawn,
         ${S.deposited} AS deposited,
         ${COUNTERPART} AS counterpart,
         (SELECT SUM(c.gain_loss_eur) FROM fifo_lot_consumptions c WHERE c.consuming_transaction_id = v.id) AS gp_eur,
         ${marginSql('v', marginAccountsP)} AS is_margin,
         ${feeInPriceSql('v')} IS NOT NULL AS fee_in_price,
         DATE_TRUNC('${unit}', v.timestamp AT TIME ZONE ${tzP}) AS bucket,
         ${grouped ? 'EXISTS (SELECT 1 FROM visible s WHERE s.id = v.id)' : 'TRUE'} AS shown
       FROM filtered v
     ),
     shown AS (SELECT * FROM vt WHERE shown AND ${notMargin}),
     -- Cada comisión cobrada: la de la columna fee de una operación y las filas FEE_*.
     fee_items AS (
       SELECT fee_asset AS asset, fee_amount AS amount, fee_value_eur AS eur, fee_value_eur * usd AS usd, timestamp, bucket, FALSE AS included
       FROM vt WHERE fee_asset IS NOT NULL AND fee_amount > 0 AND operation_type NOT IN ${sqlList(FEE_TYPES)} AND ${notMargin} ${paidHere}
       UNION ALL
       SELECT COALESCE(fee_asset, asset), COALESCE(fee_amount, ABS(amount)), value_eur, value_eur * usd, timestamp, bucket, FALSE
       FROM vt WHERE operation_type IN ${sqlList(FEE_TYPES)} AND ${notMargin} ${paidHere}
       UNION ALL
       -- Incluida en el coste de la compra (#415): en EUR vale lo que es; en otra moneda, sin valor.
       SELECT included_fee_asset, included_fee_amount,
         CASE WHEN included_fee_asset = 'EUR' THEN included_fee_amount END,
         CASE WHEN included_fee_asset = 'EUR' THEN included_fee_amount * usd END, timestamp, bucket, TRUE
       FROM vt WHERE included_fee_amount > 0 AND ${notMargin} ${paidHere}
     )
     SELECT
       (SELECT json_build_object(
          'ops',              COUNT(*),
          'unique_assets',    COUNT(DISTINCT asset),
          'manual',           COUNT(*) FILTER (WHERE manually_added),
          'fiat_buys',        COUNT(*) FILTER (WHERE invested),
          'invested_eur',     COALESCE(SUM(value_eur) FILTER (WHERE invested), 0),
          'invested_usd',     COALESCE(SUM(value_eur * usd) FILTER (WHERE invested), 0),
          'recovered_eur',    COALESCE(SUM(value_eur) FILTER (WHERE recovered), 0),
          'recovered_usd',    COALESCE(SUM(value_eur * usd) FILTER (WHERE recovered), 0),
          'sells',            COUNT(*) FILTER (WHERE is_sale),
          'sold_eur',         COALESCE(SUM(value_eur) FILTER (WHERE is_sale), 0),
          'sold_usd',         COALESCE(SUM(value_eur * usd) FILTER (WHERE is_sale), 0),
          'sold_gp_eur',      COALESCE(SUM(gp_eur) FILTER (WHERE is_sale), 0),
          'sold_gp_usd',      COALESCE(SUM(gp_eur * usd) FILTER (WHERE is_sale), 0),
          'stable_ops',       COUNT(*) FILTER (WHERE stable_to_fiat),
          'stable_eur',       COALESCE(SUM(value_eur) FILTER (WHERE stable_to_fiat), 0),
          'stable_usd',       COALESCE(SUM(value_eur * usd) FILTER (WHERE stable_to_fiat), 0),
          'withdrawn_ops',    COUNT(*) FILTER (WHERE withdrawn),
          'withdrawn_eur',    COALESCE(SUM(value_eur) FILTER (WHERE withdrawn), 0),
          'withdrawn_usd',    COALESCE(SUM(value_eur * usd) FILTER (WHERE withdrawn), 0),
          'deposited_eur',    COALESCE(SUM(value_eur) FILTER (WHERE deposited), 0),
          'deposited_usd',    COALESCE(SUM(value_eur * usd) FILTER (WHERE deposited), 0),
          'fee_in_price_ops', COUNT(*) FILTER (WHERE fee_in_price),
          'income_ops',       COUNT(*) FILTER (WHERE cat = 'ingresos'),
          'income_eur',       COALESCE(SUM(value_eur) FILTER (WHERE cat = 'ingresos'), 0),
          'income_usd',       COALESCE(SUM(value_eur * usd) FILTER (WHERE cat = 'ingresos'), 0),
          'income_sin_valor', COUNT(*) FILTER (WHERE cat = 'ingresos' AND value_eur IS NULL)
        ) FROM shown) AS totals,
       (SELECT json_build_object(
          'ops', COUNT(*), 'eur', COALESCE(SUM(eur), 0), 'usd', COALESCE(SUM(usd), 0),
          'sin_valor', COUNT(*) FILTER (WHERE eur IS NULL),
          'included_ops', COUNT(*) FILTER (WHERE included),
          'included_eur', COALESCE(SUM(eur) FILTER (WHERE included), 0),
          'included_usd', COALESCE(SUM(usd) FILTER (WHERE included), 0)
        ) FROM fee_items) AS fees,
       (SELECT COALESCE(json_agg(k), '[]') FROM (
          SELECT counterpart, COUNT(*) AS ops, COALESCE(SUM(value_eur), 0) AS eur, COALESCE(SUM(value_eur * usd), 0) AS usd
          FROM shown WHERE is_sale GROUP BY counterpart
        ) k) AS counterparts,
       (SELECT json_build_object('ops', COUNT(*), 'sells', COUNT(*) FILTER (WHERE is_sale))
        FROM vt WHERE shown AND is_margin) AS margin,
       -- Importe de cada tarjeta por periodo (#407), en el mismo periodo que el gráfico.
       (SELECT COALESCE(json_agg(x ORDER BY x.periodo), '[]') FROM (
          SELECT TO_CHAR(b.bucket, '${fmt}') AS periodo,
            COALESCE(SUM(s.value_eur) FILTER (WHERE s.invested), 0) AS inv_eur, COALESCE(SUM(s.value_eur * s.usd) FILTER (WHERE s.invested), 0) AS inv_usd,
            COALESCE(SUM(s.value_eur) FILTER (WHERE s.withdrawn), 0) AS ret_eur, COALESCE(SUM(s.value_eur * s.usd) FILTER (WHERE s.withdrawn), 0) AS ret_usd,
            COALESCE(SUM(s.value_eur) FILTER (WHERE s.is_sale), 0) AS ven_eur, COALESCE(SUM(s.value_eur * s.usd) FILTER (WHERE s.is_sale), 0) AS ven_usd,
            COALESCE(SUM(s.value_eur) FILTER (WHERE s.cat = 'ingresos'), 0) AS ing_eur, COALESCE(SUM(s.value_eur * s.usd) FILTER (WHERE s.cat = 'ingresos'), 0) AS ing_usd,
            (SELECT COALESCE(SUM(f.eur), 0) FROM fee_items f WHERE f.bucket = b.bucket) AS com_eur,
            (SELECT COALESCE(SUM(f.usd), 0) FROM fee_items f WHERE f.bucket = b.bucket) AS com_usd
          FROM generate_series(${fromP}::date::timestamp, ${toP}::date::timestamp, INTERVAL '1 ${unit}') AS b(bucket)
          LEFT JOIN shown s ON s.bucket = b.bucket
          GROUP BY b.bucket
        ) x) AS series,
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
  const byCounterpart = Object.fromEntries(COUNTERPARTS.map(k => [k, { ops: 0, value: money(0, 0) }])) as HistoryStats['totals']['sold_by_counterpart'];
  for (const k of r.counterparts as { counterpart: Counterpart; ops: number; eur: number; usd: number }[]) {
    byCounterpart[k.counterpart] = { ops: num(k.ops), value: money(k.eur, k.usd) };
  }

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
      recovered: money(t.recovered_eur, t.recovered_usd),
      sells: num(t.sells), sold: money(t.sold_eur, t.sold_usd), sold_gp: money(t.sold_gp_eur, t.sold_gp_usd),
      sold_by_counterpart: byCounterpart,
      stable_to_fiat: { ops: num(t.stable_ops), value: money(t.stable_eur, t.stable_usd) },
      withdrawn_ops: num(t.withdrawn_ops), withdrawn: money(t.withdrawn_eur, t.withdrawn_usd),
      deposited: money(t.deposited_eur, t.deposited_usd),
      income_ops: num(t.income_ops), income: money(t.income_eur, t.income_usd), income_sin_valor: num(t.income_sin_valor),
      fee_ops: num(r.fees.ops), fees: money(r.fees.eur, r.fees.usd), fees_sin_valor: num(r.fees.sin_valor),
      fees_included: { ops: num(r.fees.included_ops), value: money(r.fees.included_eur, r.fees.included_usd) },
      fees_in_price_ops: num(t.fee_in_price_ops),
    },
    chart: { ...period, buckets: [...buckets.values()] },
    series: (r.series as Record<string, unknown>[]).map(x => ({
      periodo: String(x.periodo),
      valor: {
        invertido: money(x.inv_eur, x.inv_usd), retirado: money(x.ret_eur, x.ret_usd), ventas: money(x.ven_eur, x.ven_usd),
        ingresos: money(x.ing_eur, x.ing_usd), comisiones: money(x.com_eur, x.com_usd),
      },
    })),
    rankings_periodo: datesFiltered ? 'filtrado' : 'ultimo_anio',
    top_assets: (r.top_assets as Record<string, unknown>[]).map(a => ({ asset: String(a.asset), ops: num(a.ops), volume: money(a.eur, a.usd) })),
    fees_by_asset: (r.fees_by_asset as Record<string, unknown>[]).map(x => ({
      asset: String(x.asset), ops: num(x.ops), amount: num(x.amount), value: money(x.eur, x.usd),
    })),
    margin: { included: includeMargin, ops: num(r.margin.ops), sells: num(r.margin.sells) },
  };
}
