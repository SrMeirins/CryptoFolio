import { T, alpha } from '../utils/colors'
export type OpGroup = 'buy' | 'sell' | 'income' | 'fee' | 'transfer' | 'other'

export interface OpMeta {
  label: string
  color: string
  group: OpGroup
  rowBg: string
}

export const OP_META: Record<string, OpMeta> = {
  BUY:                     { label: 'Compra',           color: T.positive, group: 'buy',      rowBg: alpha(T.positive, 4) },
  BUY_FIAT:                { label: 'Compra EUR',       color: T.positive, group: 'buy',      rowBg: alpha(T.positive, 4) },
  BUY_CRYPTO:              { label: 'Compra cripto',    color: T.positive, group: 'buy',      rowBg: alpha(T.positive, 4) },
  SELL:                    { label: 'Venta',            color: T.negative, group: 'sell',     rowBg: alpha(T.negative, 4)  },
  SELL_FIAT:               { label: 'Venta EUR',        color: T.negative, group: 'sell',     rowBg: alpha(T.negative, 4)  },
  SELL_CRYPTO:             { label: 'Venta cripto',     color: T.negative, group: 'sell',     rowBg: alpha(T.negative, 4)  },
  DEPOSIT_FIAT:            { label: 'Depósito EUR',     color: T.brand, group: 'other',    rowBg: alpha(T.brand, 4) },
  DEPOSIT_CRYPTO:          { label: 'Depósito cripto',  color: T.purple, group: 'other',    rowBg: alpha(T.purple, 4) },
  WITHDRAW:                { label: 'Retirada',         color: T.warning, group: 'transfer', rowBg: alpha(T.warning, 4) },
  WITHDRAW_FIAT:           { label: 'Retirada EUR',     color: T.warning, group: 'transfer', rowBg: alpha(T.warning, 4) },
  STAKING_REWARD:          { label: 'Staking',          color: T.warning, group: 'income',   rowBg: alpha(T.warning, 5) },
  MINING_REWARD:           { label: 'Minería',           color: T.warning, group: 'income',   rowBg: alpha(T.warning, 5) },
  LENDING_INTEREST:        { label: 'Intereses',          color: T.warning, group: 'income',   rowBg: alpha(T.warning, 5) },
  LENDING_INTEREST_LOCKED: { label: 'Intereses bloq.',  color: T.warning, group: 'income',   rowBg: alpha(T.warning, 6)  },
  CASHBACK:                { label: 'Cashback',         color: T.warning, group: 'income',   rowBg: alpha(T.warning, 5) },
  AIRDROP:                 { label: 'Airdrop',          color: T.warning, group: 'income',   rowBg: alpha(T.warning, 5) },
  FORK:                    { label: 'Fork',             color: T.warning, group: 'income',   rowBg: alpha(T.warning, 5) },
  TRANSFER_INTERNAL:       { label: 'Transferencia',    color: T.muted, group: 'transfer', rowBg: 'transparent'           },
  STAKING_LOCK:            { label: 'Bloqueo staking',  color: T.warning, group: 'transfer', rowBg: alpha(T.warning, 4) },
  STAKING_UNLOCK:          { label: 'Desbloq. staking',  color: T.positive, group: 'transfer', rowBg: alpha(T.positive, 4) },
  LAUNCHPOOL_LOCK:         { label: 'Bloqueo launchpool',  color: T.purple, group: 'transfer', rowBg: alpha(T.purple, 4) },
  LAUNCHPOOL_UNLOCK:       { label: 'Desbloq. launchpool',color: T.positive, group: 'transfer', rowBg: alpha(T.positive, 4) },
  // Margen aislado de Binance (Isolated/Margin Loan y Repayment): el
  // préstamo abre un lote a precio de mercado para el FIFO, la devolución
  // lo consume sin impacto fiscal (backend/src/modules/csv/parser.ts).
  MARGIN_BORROW:           { label: 'Préstamo margen',  color: T.purple, group: 'other',    rowBg: alpha(T.purple, 4) },
  MARGIN_REPAY:            { label: 'Devolución margen',color: T.muted, group: 'transfer', rowBg: 'transparent'           },
  GIFT_SENT:               { label: 'Regalo',           color: T.negative, group: 'sell',     rowBg: alpha(T.negative, 4)  },
  LOST:                    { label: 'Pérdida',          color: T.negative, group: 'sell',     rowBg: alpha(T.negative, 4)  },
  FEE:                     { label: 'Comisión',         color: T.info, group: 'fee',      rowBg: alpha(T.info, 4) },
  FEE_NETWORK:             { label: 'Comisión red',     color: T.info, group: 'fee',      rowBg: alpha(T.info, 4) },
  FEE_EXCHANGE:            { label: 'Comisión exchange', color: T.info, group: 'fee',      rowBg: alpha(T.info, 4) },
  IGNORED:                 { label: 'Ignorada',         color: T.track, group: 'other',    rowBg: 'transparent'           },
}

// ── Nombre por las dos partes de la operación (#488) ─────────────────────────
// Código Civil: compraventa = cosa a cambio de precio en dinero (art. 1445);
// permuta = cosa por cosa (art. 1538). La AEAT trata el intercambio de una
// moneda virtual por otra como permuta (art. 37.1.h LIRPF). Las stablecoins
// son monedas virtuales, no dinero (clave N de la casilla 1800, #531). Así que
// el nombre depende de lo que se entrega y se recibe, no de si el exchange lo
// registró como compra o como venta. Espejo de displayOperationLabel en
// backend/src/modules/history/operationLabels.ts (mismos casos en los tests).

/** Moneda de curso legal: el resto, stablecoins incluidas, es moneda virtual. */
export const FIAT_CURRENCIES = new Set(['EUR', 'USD', 'GBP', 'CHF', 'BRL', 'ARS'])
/** Wallet de sistema para destinos no registrados: un retiro allí no es un traspaso propio. */
export const EXTERNAL_WALLET_NAME = 'Wallets externas'

const BUY_TYPES = new Set(['BUY', 'BUY_FIAT', 'BUY_CRYPTO'])
const SELL_TYPES = new Set(['SELL', 'SELL_FIAT', 'SELL_CRYPTO'])
const isFiat = (a: string | null | undefined) => !!a && FIAT_CURRENCIES.has(a.toUpperCase())

const PERMUTA: OpMeta = { label: 'Permuta', color: T.purple, group: 'buy', rowBg: alpha(T.purple, 4) }
const TRASPASO: OpMeta = { label: 'Traspaso', color: T.muted, group: 'transfer', rowBg: 'transparent' }

export interface OpLike {
  operation_type: string
  asset?: string | null
  cost_asset?: string | null
  destination_wallet_id?: string | null
  destination_wallet_name?: string | null
}

/**
 * Nombre, color y grupo de una operación concreta (#488):
 * - compra o venta entre cripto (stablecoins incluidas): «Permuta»;
 * - comprar dinero entregando cripto: «Venta»;
 * - retiro a una wallet propia registrada: «Traspaso».
 * El grupo de la permuta sigue el del tipo guardado, para no alterar recuentos
 * ni signos de importe.
 */
export function opMetaOf(tx: OpLike): OpMeta {
  const base = OP_META[tx.operation_type] ?? { label: tx.operation_type, color: T.muted, group: 'other' as const, rowBg: 'transparent' }
  const op = tx.operation_type
  if (BUY_TYPES.has(op)) {
    if (isFiat(tx.asset) && tx.cost_asset && !isFiat(tx.cost_asset)) return OP_META.SELL
    if (tx.cost_asset && !isFiat(tx.cost_asset)) return { ...PERMUTA, group: base.group }
    return base
  }
  if (SELL_TYPES.has(op)) {
    if (tx.cost_asset && !isFiat(tx.cost_asset)) return { ...PERMUTA, group: base.group }
    return base
  }
  if (op === 'WITHDRAW' && tx.destination_wallet_id && tx.destination_wallet_name !== EXTERNAL_WALLET_NAME) return TRASPASO
  return base
}
