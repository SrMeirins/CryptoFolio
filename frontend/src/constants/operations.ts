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
