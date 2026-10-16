// Consumo FIFO de una venta hipotética (#279). Función pura: recibe los lotes
// abiertos de UNA wallet ya ordenados (el más antiguo primero), como hace el
// motor fiscal, y reparte la comisión de venta en proporción al importe de
// cada lote: la comisión reduce el valor de transmisión.

export interface LoteAbierto {
  id: string;
  walletName: string;
  openedAt: string;          // YYYY-MM-DD
  quantity: number;          // restante
  costBasis: number;         // coste del restante, EUR
  pricePerUnit: number;      // precio de compra por unidad, EUR
}

export interface LoteConsumido {
  lotId: string;
  walletName: string;
  openedAt: string;
  qtyAvailable: number;
  qtyConsumed: number;
  partial: boolean;
  costBasisConsumed: number;
  pricePerUnit: number;
  proceedsEur: number;       // bruto
  feeEur: number;
  gainLossEur: number;       // bruto − comisión − coste
}

export interface ConsumoFifo {
  totalProceeds: number;     // bruto
  totalFee: number;
  netProceeds: number;       // bruto − comisión
  totalCostBasis: number;
  totalGain: number;
  totalLoss: number;
  netGainLoss: number;
  lotsConsumed: LoteConsumido[];
}

const EPS = 1e-7;
const round2 = (n: number) => Math.round(n * 100) / 100;

export function consumirFifo(lotes: readonly LoteAbierto[], quantity: number, priceEur: number, feePct = 0): ConsumoFifo {
  const feeRate = Math.min(Math.max(feePct, 0), 100) / 100;
  let remaining = quantity;
  const lotsConsumed: LoteConsumido[] = [];
  let totalProceeds = 0, totalFee = 0, totalCostBasis = 0, totalGain = 0, totalLoss = 0;

  for (const lot of lotes) {
    if (remaining <= EPS) break;
    const consumed = Math.min(lot.quantity, remaining);
    const cost = lot.costBasis * (consumed / lot.quantity);
    const proceeds = consumed * priceEur;
    const fee = proceeds * feeRate;
    const gainLoss = proceeds - fee - cost;
    totalProceeds += proceeds;
    totalFee += fee;
    totalCostBasis += cost;
    if (gainLoss >= 0) totalGain += gainLoss; else totalLoss += gainLoss;
    lotsConsumed.push({
      lotId: lot.id, walletName: lot.walletName, openedAt: lot.openedAt,
      qtyAvailable: lot.quantity, qtyConsumed: consumed, partial: consumed < lot.quantity - EPS,
      costBasisConsumed: cost, pricePerUnit: lot.pricePerUnit, proceedsEur: proceeds, feeEur: fee, gainLossEur: gainLoss,
    });
    remaining -= consumed;
  }

  return {
    totalProceeds, totalFee, netProceeds: totalProceeds - totalFee, totalCostBasis,
    totalGain, totalLoss, netGainLoss: round2(totalGain + totalLoss), lotsConsumed,
  };
}
