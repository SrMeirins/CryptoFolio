import { ACQUISITION_TYPES, DISPOSAL_TYPES, FEE_TYPES, INFLOW_TYPES, OUTFLOW_TYPES, sqlList } from './operationGroups';

// Valoración en EUR de cada transacción del Historial (#346), en la consulta y
// sin columnas persistidas: así sigue siendo coherente tras cada recálculo FIFO.
//
// Valor de la operación (value_eur / value_source), por orden de preferencia:
//   1. coste    — el propio activo es EUR, o se pagó/cobró en EUR (cost_amount).
//   2. fifo     — adquisiciones: valor del lote que abren (precio × cantidad
//                 original − comisión incluida en el coste); disposiciones:
//                 proceeds de los lotes que consumen. Es la cifra que usa Fiscal.
//                 Solo si el FIFO cubre toda la cantidad (un faltante de lotes
//                 daría un valor parcial).
//   3. estimado — cantidad × cierre diario del activo (price_close_madrid, día
//                 local) o, en su defecto, el precio diario de price_cache, la
//                 misma fuente que usa el motor FIFO.
//   4. sin_precio — ninguna de las anteriores: value_eur NULL.
//
// Comisión (fee_value_eur / fee_value_source): EUR directo; comisión incluida
// en el lote que abre la compra; consumo FIFO del activo de la comisión (tercer
// activo, o la parte con G/P de un retiro); o estimación con el cierre diario.
//
// Notas de implementación:
// - fifo_lots.cost_basis_eur NO sirve: las transferencias lo reducen al mover
//   parte del lote. price_per_unit_eur × quantity_original es el coste de apertura.
// - Los consumos 'NONE' (transferencias, devoluciones de margen) llevan como
//   proceeds el coste, no el valor de mercado: se excluyen.
// - Agregados con GROUP BY + hash join en vez de LATERAL: no hay índice por
//   open_transaction_id y así se recorre cada tabla una sola vez.

const DUST = 0.999;

/** CTEs auxiliares; van tras un WITH. */
export const VALUATION_CTES = `
  val_lots AS (
    SELECT open_transaction_id AS tx_id, asset,
      SUM(price_per_unit_eur * quantity_original - fee_eur) AS value_eur,
      SUM(fee_eur) AS fee_eur,
      SUM(quantity_original) AS qty
    FROM fifo_lots GROUP BY open_transaction_id, asset
  ),
  val_cons AS (
    SELECT c.consuming_transaction_id AS tx_id, l.asset,
      SUM(c.proceeds_eur) AS value_eur,
      SUM(c.quantity_consumed) AS qty
    FROM fifo_lot_consumptions c JOIN fifo_lots l ON l.id = c.lot_id
    WHERE c.fiscal_event_type <> 'NONE'
    GROUP BY c.consuming_transaction_id, l.asset
  )`;

/**
 * JOINs de valoración para la transacción con alias `t`. `tzParam` es el
 * placeholder ($n) de la zona de los cierres diarios guardados (CLOSES_TIMEZONE,
 * nunca interpolada): el día de la operación se cruza con el día del cierre.
 */
export function valuationJoins(tzParam: string): string {
  const localDay = `(t.timestamp AT TIME ZONE ${tzParam})::date`;
  const utcDay = `(t.timestamp AT TIME ZONE 'UTC')::date`;
  return `
    LEFT JOIN val_lots vl  ON vl.tx_id = t.id AND vl.asset = t.asset
    LEFT JOIN val_cons vc  ON vc.tx_id = t.id AND vc.asset = t.asset
    LEFT JOIN val_cons vcf ON vcf.tx_id = t.id AND vcf.asset = t.fee_asset
      AND t.fee_asset <> t.asset AND t.fee_asset IS DISTINCT FROM t.cost_asset
    LEFT JOIN price_close_madrid cm  ON cm.asset = t.asset AND cm.close_date = ${localDay} AND cm.price_eur > 0
    LEFT JOIN price_cache pc         ON pc.asset = t.asset AND pc.price_date = ${utcDay} AND pc.price_eur > 0
    LEFT JOIN price_close_madrid cmf ON cmf.asset = t.fee_asset AND cmf.close_date = ${localDay} AND cmf.price_eur > 0
    LEFT JOIN price_cache pcf        ON pcf.asset = t.fee_asset AND pcf.price_date = ${utcDay} AND pcf.price_eur > 0`;
}

const IS_ACQ = `(t.operation_type IN ${sqlList(ACQUISITION_TYPES)} AND vl.qty > 0 AND vl.qty >= ABS(t.amount_net) * ${DUST})`;
const IS_DIS = `(t.operation_type IN ${sqlList(DISPOSAL_TYPES)} AND vc.qty > 0 AND vc.qty >= ABS(t.amount) * ${DUST})`;
const HAS_FEE = `(t.fee_asset IS NOT NULL AND t.fee_amount > 0)`;
// Retiro con comisión en el mismo activo: la única parte con G/P es la comisión.
const WITHDRAW_FEE = `(t.operation_type = 'WITHDRAW' AND t.fee_asset = t.asset AND vc.qty > 0)`;

/** Columnas value_eur, value_source, fee_value_eur y fee_value_source. */
export const VALUATION_COLUMNS = `
  (CASE
    WHEN t.asset = 'EUR' THEN ABS(t.amount_net)
    WHEN t.cost_asset = 'EUR' AND t.cost_amount > 0 THEN ABS(t.cost_amount)
    WHEN ${IS_ACQ} THEN vl.value_eur
    WHEN ${IS_DIS} THEN vc.value_eur
    WHEN cm.price_eur IS NOT NULL THEN ABS(t.amount_net) * cm.price_eur
    WHEN pc.price_eur IS NOT NULL THEN ABS(t.amount_net) * pc.price_eur
  END)::float AS value_eur,
  (CASE
    WHEN t.asset = 'EUR' OR (t.cost_asset = 'EUR' AND t.cost_amount > 0) THEN 'coste'
    WHEN ${IS_ACQ} OR ${IS_DIS} THEN 'fifo'
    WHEN cm.price_eur IS NOT NULL OR pc.price_eur IS NOT NULL THEN 'estimado'
    ELSE 'sin_precio'
  END) AS value_source,
  (CASE
    WHEN NOT ${HAS_FEE} THEN NULL
    WHEN t.fee_asset = 'EUR' THEN t.fee_amount
    WHEN ${IS_ACQ} AND vl.fee_eur > 0 THEN vl.fee_eur
    WHEN vcf.qty > 0 THEN vcf.value_eur
    WHEN ${WITHDRAW_FEE} THEN vc.value_eur
    WHEN cmf.price_eur IS NOT NULL THEN t.fee_amount * cmf.price_eur
    WHEN pcf.price_eur IS NOT NULL THEN t.fee_amount * pcf.price_eur
  END)::float AS fee_value_eur,
  (CASE
    WHEN NOT ${HAS_FEE} THEN NULL
    WHEN t.fee_asset = 'EUR' THEN 'coste'
    WHEN (${IS_ACQ} AND vl.fee_eur > 0) OR vcf.qty > 0 OR ${WITHDRAW_FEE} THEN 'fifo'
    WHEN cmf.price_eur IS NOT NULL OR pcf.price_eur IS NOT NULL THEN 'estimado'
    ELSE 'sin_precio'
  END) AS fee_value_source`;

/**
 * Sentido de la operación en el total filtrado: 'in', 'out' o NULL (neutra).
 * Un retiro a una wallet propia es un movimiento interno, no una salida.
 */
export const FLOW_DIRECTION = `
  (CASE
    WHEN t.operation_type IN ${sqlList(INFLOW_TYPES)} THEN 'in'
    WHEN t.operation_type = 'WITHDRAW' AND t.destination_wallet_id IS NOT NULL THEN NULL
    WHEN t.operation_type IN ${sqlList(OUTFLOW_TYPES)} THEN 'out'
  END) AS flow_direction`;

/** Activo de la comisión de una fila FEE_* (el motor FIFO usa fee_asset ?? asset). */
export const FEE_ROW_TYPES = sqlList(FEE_TYPES);

/**
 * Subconsulta con cada transacción valorada (alias de salida `vt`), para las
 * estadísticas. Requiere el WITH de VALUATION_CTES delante.
 */
export function valuedTransactionsSql(tzParam: string): string {
  return `(
    SELECT t.*, ${VALUATION_COLUMNS}, ${FLOW_DIRECTION}
    FROM transactions t ${valuationJoins(tzParam)}
  )`;
}
