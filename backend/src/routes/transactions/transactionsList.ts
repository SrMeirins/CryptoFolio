import { Router, Request, Response } from 'express';
import { db } from '../../db/client';
import { usdPerEurSql } from '../../modules/fiat/displayCurrency';
import { MADRID_TZ } from '../../modules/fiscal/madridTime';
import { buildHistoryWhere, historyQuerySchema } from '../../modules/history/listFilters';
import { FLOW_DIRECTION, VALUATION_COLUMNS, VALUATION_CTES, valuationJoins } from '../../modules/history/valuationSql';
import { sendZodError } from './transactionsShared';

const router = Router();

// Zona del día local de los filtros de fecha y de los cierres diarios. La
// sustituirá la zona configurable de #347.
const HISTORY_TZ = MADRID_TZ;

// ── GET /api/transactions/facets ──────────────────────────────────────────
// Valores presentes en los datos para los filtros (cuentas, activos, tipos):
// antes la lista de cuentas era fija y faltaban cuentas reales (#346).
router.get('/facets', async (_req: Request, res: Response) => {
  const [accounts, assets, types] = await Promise.all([
    db.query(`SELECT DISTINCT account AS v FROM transactions WHERE account IS NOT NULL AND account <> '' ORDER BY 1`),
    db.query(`SELECT DISTINCT asset AS v FROM transactions ORDER BY 1`),
    db.query(`SELECT DISTINCT operation_type::text AS v FROM transactions ORDER BY 1`),
  ]);
  const values = (r: { rows: { v: string }[] }) => r.rows.map(row => row.v);
  res.json({ accounts: values(accounts), assets: values(assets), types: values(types) });
});

// ── GET /api/transactions ──────────────────────────────────────────────────
router.get('/', async (req: Request, res: Response) => {
  const parsed = historyQuerySchema.safeParse(req.query);
  if (!parsed.success) { sendZodError(res, parsed.error); return; }
  const filters = parsed.data;

  const { where, params } = buildHistoryWhere(filters, HISTORY_TZ);
  const tz = `$${params.length + 1}`;
  const limit = `$${params.length + 2}`;
  const offset = `$${params.length + 3}`;

  // La valoración se aplica solo a la página pedida (las CTE agregan una vez).
  const result = await db.query(
    `WITH ${VALUATION_CTES},
     page AS (
       SELECT t.* FROM transactions t ${where}
       ORDER BY t.timestamp DESC, t.id
       LIMIT ${limit} OFFSET ${offset}
     )
     SELECT
       t.id, t.operation_type, t.timestamp, t.asset, t.amount, t.amount_net,
       t.cost_asset, t.cost_amount, t.price_per_unit,
       t.fee_asset, t.fee_amount,
       t.wallet_id, w.name AS wallet_name, w.color AS wallet_color, w.type AS wallet_kind,
       t.account, t.destination_wallet_id,
       dw.name AS destination_wallet_name, dw.color AS destination_wallet_color,
       t.destination_pending, t.notes, t.manually_added, t.created_at,
       t.linked_tx_id,
       lt.timestamp AS linked_tx_timestamp,
       lt.operation_type AS linked_tx_operation_type,
       lt.amount AS linked_tx_amount,
       lt.asset AS linked_tx_asset,
       ${VALUATION_COLUMNS},
       ${usdPerEurSql('t.timestamp')} AS usd_per_eur
     FROM page t
     JOIN wallets w ON w.id = t.wallet_id
     LEFT JOIN wallets dw ON dw.id = t.destination_wallet_id
     LEFT JOIN transactions lt ON lt.id = t.linked_tx_id
     ${valuationJoins(tz)}
     ORDER BY t.timestamp DESC, t.id`,
    [...params, HISTORY_TZ, filters.limit, filters.offset]
  );

  // Total y flujos sobre todo lo filtrado: entradas y salidas por separado
  // (antes una sola suma que mezclaba compras, ventas y precios en otro activo).
  const sumRes = await db.query(
    `WITH ${VALUATION_CTES},
     v AS (
       SELECT ${VALUATION_COLUMNS}, ${FLOW_DIRECTION}, t.timestamp
       FROM transactions t ${valuationJoins(tz)}
       ${where}
     ),
     fx AS (SELECT v.*, ${usdPerEurSql('v.timestamp')} AS usd_per_eur FROM v WHERE v.flow_direction IS NOT NULL AND v.value_eur IS NOT NULL)
     SELECT
       (SELECT COUNT(*) FROM v)::int AS total,
       COALESCE(SUM(value_eur) FILTER (WHERE flow_direction = 'in'), 0)::float  AS in_eur,
       COALESCE(SUM(value_eur) FILTER (WHERE flow_direction = 'out'), 0)::float AS out_eur,
       COALESCE(SUM(value_eur * usd_per_eur) FILTER (WHERE flow_direction = 'in'), 0)::float  AS in_usd,
       COALESCE(SUM(value_eur * usd_per_eur) FILTER (WHERE flow_direction = 'out'), 0)::float AS out_usd,
       COUNT(*) FILTER (WHERE usd_per_eur IS NULL)::int AS sin_tipo_usd
     FROM fx`,
    [...params, HISTORY_TZ]
  );
  const s = sumRes.rows[0];

  res.json({
    transactions: result.rows,
    total: s.total,
    // Flujos de valor en ambas monedas: el cambio EUR ↔ USD no pide nada nuevo (#177).
    // USD es null si a alguna operación le falta el tipo de su fecha.
    flows: {
      EUR: { entradas: s.in_eur, salidas: s.out_eur },
      USD: s.sin_tipo_usd > 0 ? null : { entradas: s.in_usd, salidas: s.out_usd },
    },
    currency: filters.currency,
    limit:  filters.limit,
    offset: filters.offset,
  });
});

export default router;
