import { db } from '../../db/client';

// Estado de las unidades de un rendimiento (#544): cuánto de lo recibido se
// conserva, cuánto se ha transmitido (vendido, permutado o entregado como
// comisión) y con qué resultado, y cuánto salió sin efecto fiscal (devolver el
// principal de un préstamo de margen o una comisión de red sumada al coste).
// Se sigue el lote que abrió el rendimiento y los que salieron de él al
// trasladar unidades entre wallets (origin_lot_id, migración 025): lo que se
// conserva es lo que queda en todos ellos.

export interface EstadoUnidades {
  /** Cantidad recibida. */
  cantidad: number;
  /** Cantidad que sigue en tu poder, en cualquier wallet. */
  conservada: number;
  /** Cantidad que salió sin efecto fiscal (devolución de margen, comisión de red al coste). */
  sinEfecto: number;
  /** Cantidad ya transmitida, en cualquier wallet. */
  transmitida: number;
  /** Ganancia o pérdida de lo transmitido. */
  resultadoEur: number;
  /** Ejercicios en que se transmitió, en la zona de la aplicación. */
  anios: number[];
}

/** Estado de las unidades de varios rendimientos, por id de transacción. */
export async function estadoDeRendimientos(txIds: readonly string[], tz: string): Promise<Map<string, EstadoUnidades>> {
  const estado = new Map<string, EstadoUnidades>();
  if (txIds.length === 0) return estado;
  const r = await db.query(`
    WITH RECURSIVE linaje AS (
      SELECT fl.id, t.id AS tx_id, fl.quantity_original::numeric AS cantidad_raiz
      FROM fifo_lots fl
      JOIN transactions t ON t.id = fl.open_transaction_id AND fl.asset = t.asset
      WHERE t.id = ANY($1::uuid[])
      UNION ALL
      SELECT h.id, l.tx_id, NULL::numeric
      FROM fifo_lots h JOIN linaje l ON h.origin_lot_id = l.id
    )
    SELECT l.tx_id,
           (SELECT COALESCE(SUM(x.cantidad_raiz), 0) FROM linaje x WHERE x.tx_id = l.tx_id) AS cantidad,
           (SELECT COALESCE(SUM(fl.quantity_remaining), 0) FROM linaje x JOIN fifo_lots fl ON fl.id = x.id WHERE x.tx_id = l.tx_id) AS conservada,
           COALESCE(SUM(c.quantity_consumed) FILTER (WHERE c.fiscal_event_type <> 'NONE'), 0) AS transmitida,
           COALESCE(SUM(c.gain_loss_eur) FILTER (WHERE c.fiscal_event_type <> 'NONE'), 0) AS resultado,
           ARRAY_AGG(DISTINCT EXTRACT(YEAR FROM c.consumed_at AT TIME ZONE $2)::int)
             FILTER (WHERE c.fiscal_event_type <> 'NONE') AS anios
    FROM linaje l
    LEFT JOIN fifo_lot_consumptions c ON c.lot_id = l.id
    GROUP BY l.tx_id`, [txIds, tz]);
  for (const row of r.rows as Record<string, unknown>[]) {
    const cantidad = parseFloat(row.cantidad as string);
    const conservada = parseFloat(row.conservada as string);
    const transmitida = parseFloat(row.transmitida as string);
    estado.set(row.tx_id as string, {
      cantidad,
      conservada,
      // El resto de lo que ya no está: salió sin transmitirse.
      sinEfecto: Math.max(0, cantidad - conservada - transmitida),
      transmitida,
      resultadoEur: parseFloat(row.resultado as string),
      anios: ((row.anios as number[] | null) ?? []).map(Number).sort((a, b) => a - b),
    });
  }
  return estado;
}
