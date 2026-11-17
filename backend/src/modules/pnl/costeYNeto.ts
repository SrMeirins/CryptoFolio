import { db } from '../../db/client';
import { EUR_MOVEMENTS_SQL } from '../fiat/eurMovements';
import { fxSql, type DisplayCurrency } from '../fiat/displayCurrency';

// Coste y EUR neto de cada día (#507), para las mini gráficas de las tarjetas
// del Dashboard: series reales de la API, no aproximadas en el cliente.
//
// Coste: el de los lotes FIFO abiertos al cierre de cada día, como la tarjeta
// Coste (GET /api/fifo/lots). Cada lote suma su coste original desde la
// operación que lo abrió (no desde opened_at: un lote traspasado conserva la
// fecha de compra, pero existe desde el traspaso) y resta cada consumo en su
// fecha. Un traspaso consume el lote de origen y abre el de destino con el
// mismo coste, así que no cambia el total. En USD, cada lote con el tipo de su
// apertura (#174) y, si no lo tiene, con el tipo del día.
//
// EUR neto: depósitos menos retiradas a banco acumulados hasta cada cierre,
// con los mismos movimientos y conversión que GET /api/fifo/eur-flow.

export interface Movimiento { at: number; eur: number; usdPerEur: number | null }

/**
 * Suma acumulada por instante: para cada instante, la suma de los
 * movimientos con `at` menor o igual. Los movimientos y los instantes no
 * tienen por qué venir ordenados.
 */
export function acumuladoEn(instants: readonly number[], movimientos: readonly { at: number; importe: number }[]): number[] {
  const orden = [...movimientos].sort((a, b) => a.at - b.at);
  const idx = instants.map((t, i) => [t, i] as const).sort((a, b) => a[0] - b[0]);
  const out = new Array<number>(instants.length).fill(0);
  let j = 0;
  let suma = 0;
  for (const [t, i] of idx) {
    while (j < orden.length && orden[j].at <= t) suma += orden[j++].importe;
    out[i] = suma;
  }
  return out;
}

/**
 * Coste abierto en cada instante a partir de movimientos de coste (aperturas
 * en positivo, consumos en negativo), en la moneda pedida: con el tipo del
 * lote si lo tiene y, si no, con el del día (`fxDia[i]`).
 */
export function costeEn(instants: readonly number[], movimientos: readonly Movimiento[], currency: DisplayCurrency, fxDia: readonly (number | null)[]): number[] {
  if (currency === 'EUR') return acumuladoEn(instants, movimientos.map(m => ({ at: m.at, importe: m.eur })));
  const conTipo = acumuladoEn(instants, movimientos.filter(m => m.usdPerEur !== null).map(m => ({ at: m.at, importe: m.eur * (m.usdPerEur as number) })));
  const sinTipo = acumuladoEn(instants, movimientos.filter(m => m.usdPerEur === null).map(m => ({ at: m.at, importe: m.eur })));
  return instants.map((_, i) => conTipo[i] + sinTipo[i] * (fxDia[i] ?? 0));
}

/** Movimientos de coste de todos los lotes: apertura con el coste original y cada consumo. */
async function movimientosDeCoste(): Promise<Movimiento[]> {
  const lotes = await db.query<{ at: Date; coste: string; usd_per_eur: string | null }>(
    `SELECT t.timestamp AS at,
            fl.cost_basis_eur + COALESCE((SELECT SUM(c.cost_basis_consumed_eur) FROM fifo_lot_consumptions c WHERE c.lot_id = fl.id), 0) AS coste,
            fl.usd_per_eur
     FROM fifo_lots fl JOIN transactions t ON t.id = fl.open_transaction_id`,
  );
  const consumos = await db.query<{ at: Date; coste: string; usd_per_eur: string | null }>(
    `SELECT c.consumed_at AS at, c.cost_basis_consumed_eur AS coste, fl.usd_per_eur
     FROM fifo_lot_consumptions c JOIN fifo_lots fl ON fl.id = c.lot_id`,
  );
  const tipo = (v: string | null) => (v === null ? null : parseFloat(v));
  return [
    ...lotes.rows.map(r => ({ at: new Date(r.at).getTime(), eur: parseFloat(r.coste), usdPerEur: tipo(r.usd_per_eur) })),
    ...consumos.rows.map(r => ({ at: new Date(r.at).getTime(), eur: -parseFloat(r.coste), usdPerEur: tipo(r.usd_per_eur) })),
  ];
}

/** Depósitos y retiradas a banco, ya convertidos a la moneda pedida con el tipo de su fecha. */
async function movimientosEurNeto(currency: DisplayCurrency): Promise<{ at: number; importe: number }[]> {
  const r = await db.query<{ at: Date; importe: string }>(
    `SELECT timestamp AS at, amount * ${fxSql(currency, 'timestamp')} AS importe
     FROM (${EUR_MOVEMENTS_SQL}) m WHERE kind IN ('deposit', 'withdraw')`,
  );
  return r.rows.map(x => ({ at: new Date(x.at).getTime(), importe: parseFloat(x.importe) }));
}

/** Coste abierto y EUR neto acumulado al cierre de cada instante, redondeados al céntimo. */
export async function costeYNetoEn(
  instants: readonly number[], currency: DisplayCurrency, fxDia: readonly (number | null)[],
): Promise<{ coste: number[]; eurNeto: number[] }> {
  const [coste, neto] = await Promise.all([movimientosDeCoste(), movimientosEurNeto(currency)]);
  const r2 = (n: number) => Math.round(n * 100) / 100;
  return {
    coste: costeEn(instants, coste, currency, fxDia).map(r2),
    eurNeto: acumuladoEn(instants, neto).map(r2),
  };
}
