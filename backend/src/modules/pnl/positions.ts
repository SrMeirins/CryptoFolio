import { db } from '../../db/client';
import { FIAT_NO_LOT } from '../fifo/constants';
import { EUR_MOVEMENTS_SQL } from '../fiat/eurMovements';

// Reconstrucción de tenencias históricas a partir de los lotes FIFO (#165).
//
// Una transferencia entre wallets propias consume el lote de origen en la
// fecha de la transferencia y crea el de destino con la fecha de apertura
// ORIGINAL (para conservar la antigüedad fiscal). Sumar los lotes por
// `opened_at` contaba el activo dos veces entre la compra y la transferencia;
// aquí un lote creado por TRANSFER_INTERNAL o WITHDRAW empieza a contar en la
// fecha de la transferencia.
//
// El saldo en EUR no tiene lotes: se reconstruye con la definición común de
// movimientos de EUR (modules/fiat/eurMovements, #169).

export interface PositionEvent {
  asset: string;
  at: number;    // instante (ms epoch)
  delta: number; // + entra en cartera, − sale
}

const TRANSFER_TYPES = ['TRANSFER_INTERNAL', 'WITHDRAW'];

export async function loadPositionEvents(): Promise<PositionEvent[]> {
  const fiat = [...FIAT_NO_LOT];
  const [lots, consumptions, eur] = await Promise.all([
    db.query(
      `SELECT fl.asset, fl.quantity_original::float AS qty,
              CASE WHEN t.operation_type::text = ANY($1) THEN t.timestamp ELSE fl.opened_at END AS starts_at
       FROM fifo_lots fl JOIN transactions t ON t.id = fl.open_transaction_id
       WHERE NOT (fl.asset = ANY($2))`,
      [TRANSFER_TYPES, fiat],
    ),
    db.query(
      `SELECT fl.asset, c.quantity_consumed::float AS qty, c.consumed_at
       FROM fifo_lot_consumptions c JOIN fifo_lots fl ON fl.id = c.lot_id
       WHERE NOT (fl.asset = ANY($1))`,
      [fiat],
    ),
    loadEurBalanceEvents(),
  ]);

  return [
    ...lots.rows.map((r: { asset: string; qty: number; starts_at: string }) =>
      ({ asset: r.asset, at: new Date(r.starts_at).getTime(), delta: r.qty })),
    ...consumptions.rows.map((r: { asset: string; qty: number; consumed_at: string }) =>
      ({ asset: r.asset, at: new Date(r.consumed_at).getTime(), delta: -r.qty })),
    ...eur,
  ];
}

// Movimientos del saldo en EUR (definición común: modules/fiat/eurMovements).
async function loadEurBalanceEvents(): Promise<PositionEvent[]> {
  const res = await db.query(`SELECT timestamp, amount FROM (${EUR_MOVEMENTS_SQL}) m`);
  return res.rows.map((r: { timestamp: string; amount: number }) =>
    ({ asset: 'EUR', at: new Date(r.timestamp).getTime(), delta: r.amount }));
}

/**
 * Tenencias por activo en cada instante pedido (incluye los eventos con
 * `at <= instante`). Un único barrido ordenado: O(eventos + instantes).
 * Las cantidades residuales (< 1e-9) se descartan.
 */
export function holdingsAtInstants(events: readonly PositionEvent[], instants: readonly number[]): Map<string, number>[] {
  const sortedEvents = [...events].sort((a, b) => a.at - b.at);
  const order = instants.map((at, i) => ({ at, i })).sort((a, b) => a.at - b.at);
  const result: Map<string, number>[] = new Array(instants.length);
  const running = new Map<string, number>();
  let e = 0;

  for (const { at, i } of order) {
    while (e < sortedEvents.length && sortedEvents[e].at <= at) {
      const ev = sortedEvents[e++];
      running.set(ev.asset, (running.get(ev.asset) ?? 0) + ev.delta);
    }
    const snapshot = new Map<string, number>();
    for (const [asset, qty] of running) if (Math.abs(qty) > 1e-9) snapshot.set(asset, qty);
    result[i] = snapshot;
  }
  return result;
}
