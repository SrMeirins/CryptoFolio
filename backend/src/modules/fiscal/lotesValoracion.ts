import { db } from '../../db/client';
import { getHistoricalPriceEur } from '../prices/binance';

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
}

// Valora todos los lotes abiertos a una fecha contra su precio histórico —
// única fuente de verdad reutilizada por /summary (solo necesita el total de
// custodia en exchanges) y /modelo721 (necesita el desglose completo por
// activo+wallet). Antes cada endpoint repetía su propio bucle
// getLotesAFecha()+getHistoricalPriceEur() con el mismo filtro
// wallet_kind==='exchange', con riesgo de divergencia si se tocaba uno sin
// el otro.
export async function valorizarLotesEnFecha(fecha: Date): Promise<LoteValorizado[]> {
  const lotes = await getLotesAFecha(fecha);
  return Promise.all(
    lotes.map(async (row): Promise<LoteValorizado> => {
      const quantity = parseFloat(row.quantity);
      let precioEur = 0;
      let valorEur = 0;
      try {
        precioEur = await getHistoricalPriceEur(row.asset, fecha);
        valorEur = quantity * precioEur;
      } catch {
        // precio no disponible — lote excluido del cálculo (valorEur = 0)
      }
      return {
        asset:        row.asset,
        wallet_id:    row.wallet_id,
        wallet_name:  row.wallet_name,
        wallet_kind:  row.wallet_kind,
        wallet_color: row.wallet_color,
        quantity,
        costBasisEur: parseFloat(row.cost_basis),
        precioEur,
        valorEur,
      };
    })
  );
}

// Solo la custodia de terceros (exchanges) computa para el umbral del
// Modelo 721; la autocustodia (hardware/software) no se declara.
export function sumaValorCustodiaExchange(activos: LoteValorizado[]): number {
  return activos
    .filter(a => a.wallet_kind === 'exchange')
    .reduce((sum, a) => sum + a.valorEur, 0);
}
