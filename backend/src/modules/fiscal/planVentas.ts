import type { AnioFiscal } from './compensacion';
import type { Escala } from './escalasAhorro';
import { colchonSinTributar, cuotaConExtra } from './planificador';
import { consumirFifo, type LoteAbierto } from './simularVenta';

// Plan de ventas de fin de año (#546). Función pura: aplica las ventas en su
// orden con el FIFO global por activo (#476), de modo que dos ventas del mismo
// activo consumen los lotes una tras otra, igual que si se simularan por
// separado en secuencia. La wallet donde se vende solo limita la cantidad.
// Devuelve el resultado de cada venta, el efecto conjunto en la cuota del año
// y los avisos (colchón superado, regla de recompra, cantidad sin saldo).

const EPS = 1e-7;
const round2 = (n: number) => Math.round(n * 100) / 100;

export interface LotePlan extends LoteAbierto { asset: string; walletId: string }

export interface VentaPlan { asset: string; walletId: string; cantidad: number; precioEur: number }

export interface ResultadoVenta {
  indice: number;
  asset: string;
  walletId: string;
  cantidad: number;
  /** Lo que se puede vender de verdad (menos si no hay saldo suficiente). */
  cantidadVendida: number;
  precioEur: number;
  bruto: number;
  comision: number;
  coste: number;
  /** Ganancia o pérdida de la venta, tras la comisión. */
  resultado: number;
}

export type AvisoPlan =
  | { tipo: 'colchon'; exceso: number; cuotaExtra: number }
  | { tipo: 'recompra'; asset: string; compras: string[] }
  | { tipo: 'saldo'; asset: string; walletId: string; pedido: number; disponible: number };

export interface EfectoPlan {
  ventas: ResultadoVenta[];
  ganancia: number;
  perdida: number;
  neto: number;
  cuotaAntes: number;
  cuotaDespues: number;
  colchon: number;
  avisos: AvisoPlan[];
}

export interface EntradaPlan {
  /** Lotes abiertos de los activos del plan, en orden FIFO global por activo. */
  lotes: readonly LotePlan[];
  anios: readonly AnioFiscal[];
  year: number;
  tipos: readonly number[] | Escala;
  ventas: readonly VentaPlan[];
  comisionPct: number;
  /** Compras reales de cada activo en los últimos 2 meses (AAAA-MM-DD). */
  comprasRecientes: Readonly<Record<string, readonly string[]>>;
}

export function simularPlan(e: EntradaPlan): EfectoPlan {
  // Lotes que quedan de cada activo y saldo que queda en cada wallet.
  const restantes = new Map<string, LotePlan[]>();
  const saldo = new Map<string, number>();
  for (const l of e.lotes) {
    restantes.set(l.asset, [...(restantes.get(l.asset) ?? []), { ...l }]);
    const k = `${l.asset}|${l.walletId}`;
    saldo.set(k, (saldo.get(k) ?? 0) + l.quantity);
  }
  const saldoInicial = new Map(saldo);
  const pedido = new Map<string, number>();

  const ventas: ResultadoVenta[] = e.ventas.map((v, indice) => {
    const k = `${v.asset}|${v.walletId}`;
    pedido.set(k, (pedido.get(k) ?? 0) + v.cantidad);
    const lotes = restantes.get(v.asset) ?? [];
    const cantidad = Math.max(0, Math.min(v.cantidad, saldo.get(k) ?? 0));
    const c = consumirFifo(lotes, cantidad, v.precioEur, e.comisionPct);
    // Descuenta lo consumido de los lotes (FIFO global) y del saldo de la wallet.
    for (const lc of c.lotsConsumed) {
      const lote = lotes.find(l => l.id === lc.lotId)!;
      lote.costBasis -= lc.costBasisConsumed;
      lote.quantity -= lc.qtyConsumed;
    }
    restantes.set(v.asset, lotes.filter(l => l.quantity > EPS));
    const vendida = c.lotsConsumed.reduce((s, x) => s + x.qtyConsumed, 0);
    saldo.set(k, (saldo.get(k) ?? 0) - vendida);
    return {
      indice, asset: v.asset, walletId: v.walletId, cantidad: v.cantidad, cantidadVendida: vendida, precioEur: v.precioEur,
      bruto: round2(c.totalProceeds), comision: round2(c.totalFee), coste: round2(c.totalCostBasis), resultado: c.netGainLoss,
    };
  });

  const ganancia = round2(ventas.reduce((s, v) => s + Math.max(0, v.resultado), 0));
  const perdida = round2(ventas.reduce((s, v) => s + Math.min(0, v.resultado), 0));
  const neto = round2(ganancia + perdida);
  const cuotaAntes = cuotaConExtra(e.anios, e.year, e.tipos, 0);
  const cuotaDespues = cuotaConExtra(e.anios, e.year, e.tipos, neto);
  const colchon = colchonSinTributar(e.anios, e.year);

  const avisos: AvisoPlan[] = [];
  if (neto - colchon > 0.005 && cuotaDespues > cuotaAntes) {
    avisos.push({ tipo: 'colchon', exceso: round2(neto - colchon), cuotaExtra: round2(cuotaDespues - cuotaAntes) });
  }
  // Regla de recompra (art. 33.5 LIRPF): activos que el plan vende con pérdida y se compraron hace menos de 2 meses.
  const conPerdida = new Set(ventas.filter(v => v.resultado < 0).map(v => v.asset));
  for (const asset of conPerdida) {
    const compras = e.comprasRecientes[asset] ?? [];
    if (compras.length > 0) avisos.push({ tipo: 'recompra', asset, compras: [...compras] });
  }
  // Ventas que piden más de lo que hay en su wallet.
  for (const [k, p] of pedido) {
    const disponible = saldoInicial.get(k) ?? 0;
    if (p > disponible + EPS) {
      const [asset, walletId] = k.split('|');
      avisos.push({ tipo: 'saldo', asset, walletId, pedido: p, disponible });
    }
  }
  return { ventas, ganancia, perdida, neto, cuotaAntes, cuotaDespues, colchon, avisos };
}
