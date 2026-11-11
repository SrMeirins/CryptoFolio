export interface FifoLot {
  id: string;
  asset: string;
  quantityOriginal: number;
  quantityRemaining: number;
  costBasisEur: number;
  pricePerUnitEur: number;
  /** Comisión de compra de todo el lote (sobre quantityOriginal), incluida en el coste (#603). */
  feeEur: number;
  openedAt: Date;
  walletId: string;
  openTransactionId: string;
  usdPerEur: number | null; // tipo USD por EUR de la apertura (#174)
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
  /**
   * Comisión que el exchange ya incluye en cost_amount (#415, Bitvavo): no
   * cambia el coste; solo se guarda aparte en el lote para mostrarla como
   * gasto de adquisición (#543).
   */
  included_fee_asset?: string | null;
  included_fee_amount?: number | null;
  wallet_id: string;
  destination_wallet_id: string | null;
  destination_pending: boolean;
  /**
   * Comisiones de la orden en otra moneda (#543): filas FEE_EXCHANGE enlazadas
   * con linked_tx_id. Son gasto de esta compra o venta; el activo de la
   * comisión se consume en su propia fila.
   */
  comisiones_enlazadas?: readonly { asset: string; amount: number }[];
}

/**
 * Déficit de una operación (#380): pidió `requested` de un activo en una wallet
 * y faltaban `missing` en lotes. Se guarda en fifo_shortfalls.
 */
export interface FifoShortfall {
  txId: string;
  asset: string;
  walletId: string;
  requested: number;
  missing: number;
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
  /** Déficits de esta ejecución (#380), además del texto en `errors`. */
  shortfalls: FifoShortfall[];
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

// Comisión de red en traspasos a wallets propias registradas (#532): se trata
// como transmisión (por defecto, consume lotes con ganancia o pérdida) o su
// coste se suma al de las unidades que llegan al destino, sin efecto fiscal.
// No hay criterio expreso de la DGT para este caso: es una elección del usuario.
export const COMISION_RED_KEY = 'fifo_comision_red_traspaso';
export const COMISION_RED_CRITERIOS = ['transmision', 'coste'] as const;
export type ComisionRedCriterio = typeof COMISION_RED_CRITERIOS[number];

export interface OpcionesMotor {
  comisionRed: ComisionRedCriterio;
  /** «Wallets externas»: no es una wallet propia registrada, siempre transmisión. */
  walletExterna: string | null;
}

// Activos fiat: nunca tienen lotes FIFO, las transferencias internas son no-ops silenciosas
export const FIAT_NO_LOT = new Set(['EUR', 'USD', 'GBP', 'CHF', 'BRL', 'ARS']);
