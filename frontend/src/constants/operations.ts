export type OpGroup = 'buy' | 'sell' | 'income' | 'fee' | 'transfer' | 'other'

export interface OpMeta {
  label: string
  color: string
  group: OpGroup
  rowBg: string
}

export const OP_META: Record<string, OpMeta> = {
  BUY:               { label: 'Compra',        color: '#10b981', group: 'buy',      rowBg: 'rgba(16,185,129,0.04)'  },
  BUY_FIAT:          { label: 'Compra EUR',    color: '#10b981', group: 'buy',      rowBg: 'rgba(16,185,129,0.04)'  },
  BUY_CRYPTO:        { label: 'Compra cripto', color: '#10b981', group: 'buy',      rowBg: 'rgba(16,185,129,0.04)'  },
  SELL:              { label: 'Venta',         color: '#ef4444', group: 'sell',     rowBg: 'rgba(239,68,68,0.04)'   },
  SELL_FIAT:         { label: 'Venta EUR',     color: '#ef4444', group: 'sell',     rowBg: 'rgba(239,68,68,0.04)'   },
  SELL_CRYPTO:       { label: 'Venta cripto',  color: '#ef4444', group: 'sell',     rowBg: 'rgba(239,68,68,0.04)'   },
  DEPOSIT_FIAT:      { label: 'Depósito',      color: '#6366f1', group: 'other',    rowBg: 'rgba(99,102,241,0.04)'  },
  WITHDRAW:          { label: 'Retirada',      color: '#f59e0b', group: 'transfer', rowBg: 'rgba(245,158,11,0.04)'  },
  WITHDRAW_FIAT:     { label: 'Retirada EUR',  color: '#f59e0b', group: 'transfer', rowBg: 'rgba(245,158,11,0.04)'  },
  STAKING_REWARD:    { label: 'Staking',       color: '#a78bfa', group: 'income',   rowBg: 'rgba(167,139,250,0.05)' },
  MINING_REWARD:     { label: 'Mining',        color: '#a78bfa', group: 'income',   rowBg: 'rgba(167,139,250,0.05)' },
  LENDING_INTEREST:  { label: 'Lending',       color: '#a78bfa', group: 'income',   rowBg: 'rgba(167,139,250,0.05)' },
  CASHBACK:          { label: 'Cashback',      color: '#a78bfa', group: 'income',   rowBg: 'rgba(167,139,250,0.05)' },
  AIRDROP:           { label: 'Airdrop',       color: '#a78bfa', group: 'income',   rowBg: 'rgba(167,139,250,0.05)' },
  FORK:              { label: 'Fork',          color: '#a78bfa', group: 'income',   rowBg: 'rgba(167,139,250,0.05)' },
  TRANSFER_INTERNAL: { label: 'Transferencia', color: '#6b7280', group: 'transfer', rowBg: 'transparent'            },
  GIFT_SENT:         { label: 'Regalo',        color: '#ef4444', group: 'sell',     rowBg: 'rgba(239,68,68,0.04)'   },
  LOST:              { label: 'Pérdida',       color: '#ef4444', group: 'sell',     rowBg: 'rgba(239,68,68,0.04)'   },
  FEE_NETWORK:       { label: 'Fee red',       color: '#3b82f6', group: 'fee',      rowBg: 'rgba(59,130,246,0.04)'  },
  FEE_EXCHANGE:      { label: 'Fee exchange',  color: '#3b82f6', group: 'fee',      rowBg: 'rgba(59,130,246,0.04)'  },
  IGNORED:           { label: 'Ignorada',      color: '#374151', group: 'other',    rowBg: 'transparent'            },
}
