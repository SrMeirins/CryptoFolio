import { BUY_TYPES, FEE_TYPES, SELL_TYPES, sqlList } from './operationGroups';
import { VALUATION_COLUMNS, valuationJoins } from './valuationSql';

// Comisiones agrupadas con su compra o venta (#371). Binance registra cada
// comisión como un movimiento aparte (a veces una por fill); aquí se empareja
// cada una con su operación para mostrarlas juntas. Solo presentación: flujos,
// estadísticas, FIFO y Fiscal no cambian.
//
// Regla: misma wallet y mismo instante que una compra o venta. Con varias
// candidatas, la única que comparta activo (activo o contrapartida); si sigue
// siendo ambiguo, o solo hay operaciones de margen, la comisión queda suelta.

const FEES = sqlList(FEE_TYPES);
const TRADES = sqlList([...BUY_TYPES, ...SELL_TYPES]);

/** CTEs fee_cand y fee_parent (fee_id → parent_id); van tras un WITH junto a VALUATION_CTES. */
export const FEE_PARENT_CTES = `
  fee_cand AS (
    SELECT f.id AS fee_id, o.id AS op_id, (o.asset = f.asset OR o.cost_asset = f.asset) AS shares
    FROM transactions f
    JOIN transactions o ON o.wallet_id = f.wallet_id AND o.timestamp = f.timestamp
     AND o.operation_type IN ${TRADES}
    WHERE f.operation_type IN ${FEES}
  ),
  fee_parent AS (
    SELECT fee_id,
      CASE
        WHEN COUNT(*) = 1 THEN (ARRAY_AGG(op_id))[1]
        WHEN COUNT(*) FILTER (WHERE shares) = 1 THEN (ARRAY_AGG(op_id) FILTER (WHERE shares))[1]
      END AS parent_id
    FROM fee_cand GROUP BY fee_id
  )`;

/**
 * CTE fee_valued: cada comisión emparejada con su valoración, sin aplicar los
 * filtros de la vista (las comisiones de una operación visible se adjuntan
 * aunque su tipo quede fuera del filtro). `tzParam` es el placeholder de la zona.
 */
export function feeValuedCte(tzParam: string): string {
  return `
  fee_valued AS (
    SELECT t.id, t.asset, t.amount, t.timestamp, fp.parent_id, ${VALUATION_COLUMNS}
    FROM transactions t
    JOIN fee_parent fp ON fp.fee_id = t.id AND fp.parent_id IS NOT NULL
    ${valuationJoins(tzParam)}
  )`;
}

/** Columna grouped_fees (JSON) de la fila `t`: sus comisiones agrupadas, en orden. */
export const GROUPED_FEES_COLUMN = `
  (SELECT COALESCE(json_agg(json_build_object(
      'id', fv.id, 'asset', fv.asset, 'amount', fv.amount,
      'value_eur', fv.value_eur, 'value_source', fv.value_source) ORDER BY fv.id), '[]'::json)
   FROM fee_valued fv WHERE fv.parent_id = t.id) AS grouped_fees`;
