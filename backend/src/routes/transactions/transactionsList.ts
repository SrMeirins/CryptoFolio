import { Router, Request, Response } from 'express';
import { db } from '../../db/client';
import { usdPerEurSql } from '../../modules/fiat/displayCurrency';
import { MADRID_TZ } from '../../modules/fiscal/madridTime';
import { historyQuerySchema } from '../../modules/history/listFilters';
import { filteredValuedCtes, groupingEnabled, historyRowsSql } from '../../modules/history/historyQuery';
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

  // Orden en el servidor (#349): se valora todo lo filtrado antes de paginar,
  // así «ordenar por valor» abarca todas las páginas.
  const grouped = groupingEnabled(filters);
  const rows = historyRowsSql(filters, HISTORY_TZ, { limit: filters.limit, offset: filters.offset }, grouped);
  const result = await db.query(rows.sql, rows.params);

  // Total y flujos sobre todo lo filtrado (los mismos CTEs que la página, #366):
  // entradas y salidas por separado, en ambas monedas.
  // El recuento es de filas visibles (#371); los flujos, de todo lo filtrado.
  const { ctes, params } = filteredValuedCtes(filters, HISTORY_TZ, grouped);
  const sumRes = await db.query(
    `WITH ${ctes},
     fx AS (SELECT f.*, ${usdPerEurSql('f.timestamp')} AS usd_per_eur FROM filtered f WHERE f.flow_direction IS NOT NULL AND f.value_eur IS NOT NULL)
     SELECT
       (SELECT COUNT(*) FROM visible)::int AS total,
       COALESCE(SUM(value_eur) FILTER (WHERE flow_direction = 'in'), 0)::float  AS in_eur,
       COALESCE(SUM(value_eur) FILTER (WHERE flow_direction = 'out'), 0)::float AS out_eur,
       COALESCE(SUM(value_eur * usd_per_eur) FILTER (WHERE flow_direction = 'in'), 0)::float  AS in_usd,
       COALESCE(SUM(value_eur * usd_per_eur) FILTER (WHERE flow_direction = 'out'), 0)::float AS out_usd,
       COUNT(*) FILTER (WHERE usd_per_eur IS NULL)::int AS sin_tipo_usd
     FROM fx`,
    params
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
    grouped_fees: grouped,
    limit:  filters.limit,
    offset: filters.offset,
  });
});

export default router;
