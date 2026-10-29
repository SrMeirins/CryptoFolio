import { db } from '../../db/client';
import { calcularIrpfAhorro, desgloseMarginal, type TramoMarginal } from './irpf';
import { escalaDe, type Escala } from './escalasAhorro';
import { baseAhorro, cargarAniosFiscales, compensarPerdidas, type AnioFiscal } from './carryforward';
import { consumirFifo, type ConsumoFifo, type LoteAbierto } from './simularVenta';
import { localYearMonth } from '../time/localTime';
import { getAppTimezone } from '../time/appTimezone';

// Contexto de una venta simulada (#279, #280): se carga una vez (lotes de la
// wallet, años fiscales y tipos del IRPF) y permite evaluar cualquier
// cantidad y precio con exactamente la misma regla: FIFO de la wallet,
// comisión e IRPF marginal con compensación de pérdidas entre años. Lo usan
// el resultado, la curva por precio y la cantidad para un neto objetivo.

export interface WalletDisponible { walletId: string; walletName: string; quantity: number }

export interface ContextoVenta {
  asset: string;
  wallet: WalletDisponible;
  wallets: WalletDisponible[];
  lotes: LoteAbierto[];
  anios: AnioFiscal[];
  year: number;
  tipos: Escala;
  baseAntes: number;
}

export interface EvaluacionVenta extends ConsumoFifo {
  irpf: { year: number; baseAntes: number; baseDespues: number; marginal: number; desglose: TramoMarginal[] };
  /** Importe neto de comisión menos el IRPF (si la venta lo genera). */
  netoEnMano: number;
  /** Ganancia o pérdida tras comisión e IRPF (un ahorro de IRPF reduce la pérdida). */
  resultadoNeto: number;
}

export type ErrorContexto = { status: number; error: string };

export async function cargarContextoVenta(asset: string, walletId?: string): Promise<ContextoVenta | ErrorContexto> {
  const walletsRes = await db.query(
    `SELECT fl.wallet_id, w.name AS wallet_name, SUM(fl.quantity_remaining)::float AS quantity
     FROM fifo_lots fl JOIN wallets w ON w.id = fl.wallet_id
     WHERE fl.asset = $1 AND fl.is_closed = FALSE AND fl.quantity_remaining > 0.0000001
     GROUP BY fl.wallet_id, w.name
     ORDER BY quantity DESC, w.name`,
    [asset],
  );
  const wallets = (walletsRes.rows as Array<{ wallet_id: string; wallet_name: string; quantity: number }>)
    .map(w => ({ walletId: w.wallet_id, walletName: w.wallet_name, quantity: w.quantity }));
  if (wallets.length === 0) return { status: 404, error: `No hay lotes abiertos para ${asset}` };
  const wallet = walletId ? wallets.find(w => w.walletId === walletId) : wallets[0];
  if (!wallet) return { status: 404, error: `No hay lotes abiertos de ${asset} en esa wallet` };

  // Lotes de esa wallet en el orden del motor FIFO.
  const lotsRes = await db.query(
    `SELECT fl.id, fl.quantity_remaining::float AS quantity, fl.cost_basis_eur::float AS cost_basis,
            fl.price_per_unit_eur::float AS price_per_unit, fl.opened_at, w.name AS wallet_name
     FROM fifo_lots fl JOIN wallets w ON w.id = fl.wallet_id
     WHERE fl.asset = $1 AND fl.wallet_id = $2 AND fl.is_closed = FALSE AND fl.quantity_remaining > 0.0000001
     ORDER BY fl.opened_at ASC, fl.created_at ASC`,
    [asset, wallet.walletId],
  );
  const lotes: LoteAbierto[] = (lotsRes.rows as Array<Record<string, unknown>>).map(r => ({
    id: r.id as string,
    walletName: r.wallet_name as string,
    openedAt: new Date(r.opened_at as string).toISOString().slice(0, 10),
    quantity: r.quantity as number,
    costBasis: r.cost_basis as number,
    pricePerUnit: r.price_per_unit as number,
  }));

  const year = localYearMonth(await getAppTimezone(db)).year;
  const anios = await cargarAniosFiscales(year);
  // Escala del ejercicio en curso (#452).
  const tipos = await escalaDe(db, year);
  const baseAntes = baseAhorro(compensarPerdidas(anios).detalle.at(-1)!);
  return { asset, wallet, wallets, lotes, anios, year, tipos, baseAntes };
}

export function evaluarVenta(ctx: ContextoVenta, quantity: number, priceEur: number, feePct: number): EvaluacionVenta {
  const consumo = consumirFifo(ctx.lotes, quantity, priceEur, feePct);
  const conVenta = ctx.anios.map(a => (a.year === ctx.year ? { ...a, netoGP: a.netoGP + consumo.netGainLoss } : a));
  const baseDespues = baseAhorro(compensarPerdidas(conVenta).detalle.at(-1)!);
  const marginal = Math.round((calcularIrpfAhorro(Math.max(0, baseDespues), ctx.tipos) - calcularIrpfAhorro(Math.max(0, ctx.baseAntes), ctx.tipos)) * 100) / 100;
  return {
    ...consumo,
    irpf: {
      year: ctx.year,
      baseAntes: ctx.baseAntes,
      baseDespues,
      marginal,
      desglose: desgloseMarginal(Math.max(0, ctx.baseAntes), Math.max(0, baseDespues), ctx.tipos),
    },
    netoEnMano: consumo.netProceeds - Math.max(0, marginal),
    resultadoNeto: consumo.netGainLoss - marginal,
  };
}

/** Resultado neto de vender `quantity` a cada precio (para el gráfico). */
export function curvaVenta(ctx: ContextoVenta, quantity: number, feePct: number, prices: readonly number[]) {
  return prices.map(price => {
    const e = evaluarVenta(ctx, quantity, price, feePct);
    return { price, netGainLoss: e.netGainLoss, irpf: e.irpf.marginal, netoEnMano: e.netoEnMano, resultadoNeto: e.resultadoNeto };
  });
}

/**
 * Cantidad a vender para recibir `targetNet` en mano (tras comisión e IRPF),
 * por bisección: el neto crece con la cantidad. Si no se alcanza ni vendiendo
 * todo lo de la wallet, devuelve la cantidad máxima y `alcanzable: false`.
 */
export function cantidadParaNeto(ctx: ContextoVenta, priceEur: number, feePct: number, targetNet: number) {
  const max = ctx.wallet.quantity;
  const netoMax = evaluarVenta(ctx, max, priceEur, feePct).netoEnMano;
  if (!(priceEur > 0) || targetNet > netoMax + 0.005) return { quantity: max, netoEnMano: netoMax, alcanzable: false };
  let lo = 0, hi = max;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (evaluarVenta(ctx, mid, priceEur, feePct).netoEnMano < targetNet) lo = mid; else hi = mid;
  }
  return { quantity: hi, netoEnMano: evaluarVenta(ctx, hi, priceEur, feePct).netoEnMano, alcanzable: true };
}
