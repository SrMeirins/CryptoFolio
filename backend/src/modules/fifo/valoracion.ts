import type { PoolClient } from 'pg';
import { getPrecioMomentoEur } from '../prices/momento';

// Valor de mercado de las transmisiones (#599).
//
// Una permuta se valora en el momento de la operación por su lado más
// líquido: el que tiene un precio más fiable (EUR, estables, BTC, ETH, BNB).
// En un exchange los dos lados valen prácticamente lo mismo en ese instante,
// así que el resultado no depende del lado. Si aun así difieren más de la
// tolerancia (operación fuera de mercado), se toma el mayor de los dos
// (art. 37.1.h LIRPF) y queda indicado. Con precios del día no se aplica «el
// mayor»: la diferencia entre dos precios diarios es volatilidad del día, no
// una operación fuera de mercado.

export type CriterioValor = 'momento' | 'mayor' | 'diario';

/** Diferencia entre los dos lados por encima de la cual se toma el mayor. */
export const TOLERANCIA_MAYOR = 0.03;

const ESTABLES = new Set(['USDT', 'USDC', 'FDUSD', 'BUSD', 'DAI', 'TUSD', 'USDP']);
const PRINCIPALES = ['BTC', 'ETH', 'BNB'];

/** Rango de liquidez: menor es más líquido. */
export function rangoLiquidez(asset: string): number {
  if (asset === 'EUR' || asset === 'USD') return 0;
  if (ESTABLES.has(asset)) return 1;
  const i = PRINCIPALES.indexOf(asset);
  return i >= 0 ? 2 + i : 2 + PRINCIPALES.length;
}

export interface LadoPermuta { asset: string; cantidad: number; precio: number }

export interface Valoracion {
  /** Valor con el que se transmite lo entregado y se adquiere lo recibido. */
  valor: number;
  criterio: CriterioValor;
  valorEntregado: number;
  valorRecibido: number;
}

/** Valor de una permuta a partir de los precios de los dos lados (pura). */
export function valorarPermuta(entregado: LadoPermuta, recibido: LadoPermuta, diario: boolean): Valoracion {
  const valorEntregado = entregado.cantidad * entregado.precio;
  const valorRecibido = recibido.cantidad * recibido.precio;
  const criterioBase: CriterioValor = diario ? 'diario' : 'momento';
  // Un lado sin precio: se usa el otro.
  if (!(valorRecibido > 0)) return { valor: valorEntregado, criterio: criterioBase, valorEntregado, valorRecibido };
  if (!(valorEntregado > 0)) return { valor: valorRecibido, criterio: criterioBase, valorEntregado, valorRecibido };

  const diferencia = Math.abs(valorEntregado - valorRecibido) / Math.min(valorEntregado, valorRecibido);
  if (!diario && diferencia > TOLERANCIA_MAYOR) {
    return { valor: Math.max(valorEntregado, valorRecibido), criterio: 'mayor', valorEntregado, valorRecibido };
  }
  // A igual liquidez, el lado entregado.
  const valor = rangoLiquidez(recibido.asset) < rangoLiquidez(entregado.asset) ? valorRecibido : valorEntregado;
  return { valor, criterio: criterioBase, valorEntregado, valorRecibido };
}

/** Precio de transmisión de un activo en el momento de la operación, y si es el del día. */
export async function precioTransmision(asset: string, instante: Date): Promise<{ precio: number; diario: boolean }> {
  const p = await getPrecioMomentoEur(asset, instante);
  return { precio: p.precio, diario: p.fuente === '1d' };
}

/** Valora una permuta con los precios del momento de sus dos lados. */
export async function valorarPermutaEnMomento(
  entregado: { asset: string; cantidad: number }, recibido: { asset: string; cantidad: number }, instante: Date,
): Promise<Valoracion> {
  const [pe, pr] = await Promise.all([precioTransmision(entregado.asset, instante), precioTransmision(recibido.asset, instante)]);
  return valorarPermuta(
    { ...entregado, precio: pe.precio }, { ...recibido, precio: pr.precio },
    // Basta con que uno de los lados sea del día para no poder comparar en el momento.
    pe.diario || pr.diario,
  );
}

/**
 * Deja constancia en los consumos de un activo de una operación de cómo se
 * valoró (#599): para mostrarlo en el detalle de la operación.
 */
export async function marcarValoracion(
  client: PoolClient, txId: string, asset: string, criterio: CriterioValor,
  valores?: { valorEntregado: number; valorRecibido: number },
): Promise<void> {
  await client.query(
    `UPDATE fifo_lot_consumptions c
     SET valoracion = $3, valor_entregado_eur = $4, valor_recibido_eur = $5
     FROM fifo_lots l
     WHERE l.id = c.lot_id AND c.consuming_transaction_id = $1 AND l.asset = $2
       AND c.fiscal_event_type <> 'NONE' AND c.valoracion IS NULL`,
    [txId, asset, criterio, valores?.valorEntregado ?? null, valores?.valorRecibido ?? null]);
}
