import { db } from '../../db/client';
import { getHistoricalPriceEur } from '../prices/binance';
import { PRICE_ALIASES } from '../prices/priceAliases';

export interface LoteAFecha {
  asset: string;
  wallet_id: string;
  wallet_name: string;
  wallet_color: string;
  wallet_kind: string;
  quantity: string;
  cost_basis: string;
}

// Reconstruye el estado histórico de lotes a una fecha dada.
// Los consumos NONE (transferencias internas) restan correctamente del lote origen.
export async function getLotesAFecha(fecha: Date): Promise<LoteAFecha[]> {
  const res = await db.query(`
    SELECT
      fl.asset,
      fl.wallet_id,
      w.name  AS wallet_name,
      w.color AS wallet_color,
      w.type  AS wallet_kind,
      SUM(
        fl.quantity_original - COALESCE(
          (SELECT SUM(flc.quantity_consumed)
           FROM fifo_lot_consumptions flc
           WHERE flc.lot_id = fl.id
             AND flc.consumed_at <= $1
          ), 0
        )
      ) AS quantity,
      SUM(fl.cost_basis_eur) AS cost_basis
    FROM fifo_lots fl
    JOIN wallets w ON w.id = fl.wallet_id
    JOIN transactions t_open ON t_open.id = fl.open_transaction_id
    WHERE fl.opened_at <= $1
      AND (
        t_open.operation_type NOT IN ('TRANSFER_INTERNAL', 'WITHDRAW')
        OR t_open.timestamp <= $1
      )
    GROUP BY fl.asset, fl.wallet_id, w.name, w.color, w.type
    HAVING SUM(
      fl.quantity_original - COALESCE(
        (SELECT SUM(flc.quantity_consumed)
         FROM fifo_lot_consumptions flc
         WHERE flc.lot_id = fl.id
           AND flc.consumed_at <= $1
        ), 0
      )
    ) > 0.000001
    ORDER BY fl.asset, w.name
  `, [fecha]);
  return res.rows;
}

export async function getUmbral721(): Promise<number> {
  const res = await db.query("SELECT value FROM app_config WHERE key = 'modelo721_threshold'");
  return res.rows.length > 0 ? (parseInt(res.rows[0].value) || 50000) : 50000;
}

export interface LoteValorizado {
  asset: string;
  wallet_id: string;
  wallet_name: string;
  wallet_kind: string;
  wallet_color: string;
  quantity: number;
  costBasisEur: number;
  precioEur: number;
  valorEur: number;
  /** Sin precio a la fecha (fuente sin datos o no disponible a tiempo): valorEur = 0 (#267). */
  sinPrecio: boolean;
}

export interface ValoracionAFecha {
  activos: LoteValorizado[];
  /**
   * Activos cuyo precio no se pudo obtener ahora (fallo temporal o fuera de
   * tiempo): el valor total es un mínimo (#267). No incluye los que ninguna
   * fuente tiene (p. ej. deslistados), que valen 0 de forma definitiva.
   */
  preciosPendientes: string[];
}

/** Activos con el «sin precio» definitivo guardado en caché para esa fecha. */
async function sinPrecioDefinitivo(assets: string[], fecha: Date): Promise<Set<string>> {
  if (assets.length === 0) return new Set();
  const lookup = assets.map(a => PRICE_ALIASES[a] ?? a);
  const res = await db.query(
    `SELECT asset FROM price_cache WHERE asset = ANY($1::text[]) AND price_date = $2 AND price_eur < 0`,
    [lookup, fecha.toISOString().slice(0, 10)],
  );
  const definitivos = new Set((res.rows as Array<{ asset: string }>).map(r => r.asset));
  return new Set(assets.filter(a => definitivos.has(PRICE_ALIASES[a] ?? a)));
}

// Tiempo máximo para obtener los precios de una valoración (#267). Si Binance
// no responde (sin conexión, bloqueo por región…), CoinGecko va en cola y con
// reintentos y la petición superaba los 30 s del navegador. Al agotarse se
// responde con lo que haya; las descargas pendientes siguen en segundo plano
// y la siguiente consulta usa su resultado (caché de precios).
const DEFAULT_PRICE_BUDGET_MS = 8_000;

export function priceBudgetMs(env: string | undefined = process.env.FISCAL_PRICE_BUDGET_MS): number {
  const n = Number(env);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_PRICE_BUDGET_MS;
}

/**
 * Precio de cada activo a una fecha, con un tiempo máximo compartido; null si
 * no hay precio o no llega a tiempo. Una sola consulta por activo aunque esté
 * en varias wallets.
 */
async function preciosConPresupuesto(assets: string[], fecha: Date, budgetMs: number): Promise<Map<string, number | null>> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<'timeout'>(resolve => { timer = setTimeout(() => resolve('timeout'), budgetMs); });
  try {
    const entries = await Promise.all(assets.map(async asset => {
      const price = getHistoricalPriceEur(asset, fecha).catch(() => 0);
      const result = await Promise.race([price, deadline]);
      return [asset, result === 'timeout' || !(result > 0) ? null : result] as const;
    }));
    return new Map(entries);
  } finally {
    clearTimeout(timer);
  }
}

// Valora todos los lotes abiertos a una fecha contra su precio histórico —
// única fuente de verdad reutilizada por /summary (solo necesita el total de
// custodia en exchanges) y /modelo721 (necesita el desglose completo por
// activo+wallet). Antes cada endpoint repetía su propio bucle
// getLotesAFecha()+getHistoricalPriceEur() con el mismo filtro
// wallet_kind==='exchange', con riesgo de divergencia si se tocaba uno sin
// el otro.
export async function valorizarLotesEnFecha(fecha: Date, budgetMs = priceBudgetMs()): Promise<ValoracionAFecha> {
  const lotes = await getLotesAFecha(fecha);
  const precios = await preciosConPresupuesto([...new Set(lotes.map(l => l.asset))], fecha, budgetMs);
  const activos = lotes.map((row): LoteValorizado => {
    const quantity = parseFloat(row.quantity);
    const precio = precios.get(row.asset) ?? null;
    return {
      asset:        row.asset,
      wallet_id:    row.wallet_id,
      wallet_name:  row.wallet_name,
      wallet_kind:  row.wallet_kind,
      wallet_color: row.wallet_color,
      quantity,
      costBasisEur: parseFloat(row.cost_basis),
      precioEur:    precio ?? 0,
      valorEur:     precio === null ? 0 : quantity * precio,
      sinPrecio:    precio === null,
    };
  });
  const sinPrecio = [...new Set(activos.filter(a => a.sinPrecio).map(a => a.asset))];
  const definitivos = await sinPrecioDefinitivo(sinPrecio, fecha);
  const preciosPendientes = sinPrecio.filter(a => !definitivos.has(a)).sort();
  return { activos, preciosPendientes };
}

// Solo la custodia de terceros (exchanges) computa para el umbral del
// Modelo 721; la autocustodia (hardware/software) no se declara.
export function sumaValorCustodiaExchange(activos: LoteValorizado[]): number {
  return activos
    .filter(a => a.wallet_kind === 'exchange')
    .reduce((sum, a) => sum + a.valorEur, 0);
}
