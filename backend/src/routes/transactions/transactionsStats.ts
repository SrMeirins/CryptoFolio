import { Router, Request, Response } from 'express';
import { db } from '../../db/client';
import { currencySchema, fxSql } from '../../modules/fiat/displayCurrency';
import { MADRID_TZ } from '../../modules/fiscal/madridTime';
import {
  BUY_TYPES, FEE_TYPES, FIAT_ASSETS, INCOME_TYPES, INVESTMENT_TYPES, OTHER_OUT_TYPES, SELL_TYPES, TRANSFER_TYPES, sqlList,
} from '../../modules/history/operationGroups';
import { VALUATION_COLUMNS, VALUATION_CTES, valuationJoins } from '../../modules/history/valuationSql';

const router = Router();

// Zona del mes local del gráfico y del cierre diario (la sustituirá #347).
const STATS_TZ = MADRID_TZ;

const BUYS = sqlList(BUY_TYPES);
const SELLS = sqlList(SELL_TYPES);
const FEES = sqlList(FEE_TYPES);
// Invertido = fiat pagado en compras (#346): mismas filas en la tarjeta y en el gráfico.
const INVESTED = `(operation_type IN ${sqlList(INVESTMENT_TYPES)} AND cost_asset IN ${sqlList(FIAT_ASSETS)})`;

// ── GET /api/transactions/stats ───────────────────────────────────────────
// Una sola consulta: la valoración (CTE materializada) se calcula una vez y
// la reutilizan las cuatro secciones.
router.get('/stats', async (req: Request, res: Response) => {
  // ?currency=USD: cada importe en EUR se convierte con el tipo de su fecha (#175).
  const currency = currencySchema.safeParse(req.query.currency);
  if (!currency.success) { res.status(400).json({ error: 'currency debe ser EUR o USD' }); return; }

  const { rows } = await db.query(
    `WITH ${VALUATION_CTES},
     vt AS MATERIALIZED (
       SELECT t.id, t.operation_type, t.timestamp, t.asset, t.amount, t.amount_net,
         t.cost_asset, t.fee_asset, t.fee_amount, t.manually_added,
         ${VALUATION_COLUMNS},
         ${fxSql(currency.data, 't.timestamp')} AS fx,
         DATE_TRUNC('month', t.timestamp AT TIME ZONE $1) AS mes
       FROM transactions t ${valuationJoins('$1')}
     ),
     -- Cada comisión cobrada: la de la columna fee de una operación y las filas FEE_*.
     fee_items AS (
       SELECT fee_asset AS asset, fee_amount AS amount, fee_value_eur * fx AS value, timestamp
       FROM vt WHERE fee_asset IS NOT NULL AND fee_amount > 0 AND operation_type NOT IN ${FEES}
       UNION ALL
       SELECT COALESCE(fee_asset, asset), COALESCE(fee_amount, ABS(amount)), value_eur * fx, timestamp
       FROM vt WHERE operation_type IN ${FEES}
     )
     SELECT
       (SELECT json_build_object(
          'total_ops',       COUNT(*),
          'unique_assets',   COUNT(DISTINCT asset),
          'total_invested',  COALESCE(SUM(value_eur * fx) FILTER (WHERE ${INVESTED}), 0)::float,
          'total_fiat_buys', COUNT(*) FILTER (WHERE ${INVESTED}),
          'total_buys',      COUNT(*) FILTER (WHERE operation_type IN ${BUYS}),
          'total_sells',     COUNT(*) FILTER (WHERE operation_type IN ${SELLS}),
          'total_sold',      COALESCE(SUM(value_eur * fx) FILTER (WHERE operation_type IN ${SELLS}), 0)::float,
          'total_manual',    COUNT(*) FILTER (WHERE manually_added),
          'total_fee_ops',   (SELECT COUNT(*) FROM fee_items),
          'total_fees_eur',  (SELECT COALESCE(SUM(value), 0)::float FROM fee_items),
          'fees_sin_valor',  (SELECT COUNT(*) FROM fee_items WHERE value IS NULL)
        ) FROM vt) AS totals,
       (SELECT COALESCE(json_agg(m ORDER BY m.mes), '[]') FROM (
          SELECT TO_CHAR(mes, 'YYYY-MM') AS mes,
            COUNT(*)::int AS total_ops,
            COUNT(*) FILTER (WHERE operation_type IN ${BUYS})::int AS compras,
            COUNT(*) FILTER (WHERE operation_type IN ${SELLS})::int AS ventas,
            COUNT(*) FILTER (WHERE operation_type IN ${sqlList(OTHER_OUT_TYPES)})::int AS otras_salidas,
            COUNT(*) FILTER (WHERE operation_type IN ${sqlList(INCOME_TYPES)})::int AS ingresos,
            COUNT(*) FILTER (WHERE operation_type IN ${sqlList(TRANSFER_TYPES)})::int AS transferencias,
            COALESCE(SUM(value_eur * fx) FILTER (WHERE ${INVESTED}), 0)::float AS eur_invertido
          FROM vt
          WHERE mes >= DATE_TRUNC('month', NOW() AT TIME ZONE $1) - INTERVAL '17 months'
          GROUP BY mes
        ) m) AS monthly,
       (SELECT COALESCE(json_agg(a ORDER BY a.ops DESC, a.asset), '[]') FROM (
          SELECT asset, COUNT(*)::int AS ops, COALESCE(SUM(value_eur * fx), 0)::float AS eur_volume
          FROM vt
          WHERE operation_type IN ${sqlList([...BUY_TYPES, ...SELL_TYPES])}
            AND timestamp >= NOW() - INTERVAL '1 year'
          GROUP BY asset ORDER BY ops DESC, asset LIMIT 10
        ) a) AS top_assets,
       (SELECT COALESCE(json_agg(f ORDER BY f.total_eur DESC, f.asset), '[]') FROM (
          SELECT asset, COUNT(*)::int AS ops,
            COALESCE(SUM(amount), 0)::float AS total_amount,
            COALESCE(SUM(value), 0)::float AS total_eur
          FROM fee_items
          WHERE timestamp >= NOW() - INTERVAL '1 year'
          GROUP BY asset ORDER BY total_eur DESC, asset LIMIT 6
        ) f) AS fees`,
    [STATS_TZ]
  );
  const r = rows[0];

  res.json({
    currency:  currency.data,
    totals:    r.totals,
    monthly:   r.monthly,
    topAssets: r.top_assets,
    fees:      r.fees,
  });
});

export default router;
