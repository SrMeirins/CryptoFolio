export interface FifoLot {
  id: string;
  asset: string;
  quantityOriginal: number;
  quantityRemaining: number;
  costBasisEur: number;
  pricePerUnitEur: number;
  openedAt: Date;
  walletId: string;
  openTransactionId: string;
}

export interface Transaction {
  id: string;
  operation_type: string;
  timestamp: Date;
  asset: string;
  amount: number;
  amount_net: number;
  cost_asset: string | null;
  cost_amount: number | null;
  price_per_unit: number | null;
  fee_asset: string | null;
  fee_amount: number | null;
  wallet_id: string;
  destination_wallet_id: string | null;
  destination_pending: boolean;
}

export interface FifoRunResult {
  lotsCreated: number;
  lotsConsumed: number;
  totalGainEur: number;
  totalLossEur: number;
  errors: string[];
  // Avisos informativos no bloqueantes (ej. lote sintético creado) — separado
  // de `errors` (problemas reales: datos incompletos, lotes insuficientes).
  // Antes compartían el mismo array, sin distinción visual aguas abajo
  // (confirmado en ImportLogPanel.tsx: ambos se pintaban igual). El consumo
  // real de este campo (routes/imports.ts + frontend) queda para su propio
  // turno (Nivel 10) — este cambio solo corrige el modelo de datos en origen.
  warnings: string[];
  pendingWithdrawals: number;
}

// Umbrales de tolerancia unificados (antes: 0.0001 / 1e-10 / 1e-6 repartidos por
// el motor sin relación entre sí, dejando una zona gris entre "lote cerrado" y
// "shortfall reportable").
// - FIFO_DUST_EPSILON: por debajo de esto, un lote se considera agotado (polvo de
//   redondeo, no cantidad real). Usado tanto para decidir is_closed como para el
//   filtro de "lotes abiertos" — deben coincidir, o un lote podría quedar marcado
//   is_closed=false pero excluido igualmente por el filtro de cantidad, o viceversa.
// - FIFO_SHORTFALL_EPSILON: por encima de esto, un déficit al consumir lotes es un
//   dato real incompleto (no redondeo) y se reporta como error en vez de ignorarse.
export const FIFO_DUST_EPSILON = 1e-6;
export const FIFO_SHORTFALL_EPSILON = 1e-4;

// Activos fiat: nunca tienen lotes FIFO, las transferencias internas son no-ops silenciosas
export const FIAT_NO_LOT = new Set(['EUR', 'USD', 'GBP', 'CHF', 'BRL', 'ARS']);
