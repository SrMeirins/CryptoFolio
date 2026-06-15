/**
 * Taxonomía de operaciones de Binance CSV.
 * Array plano único — una operación puede aparecer en cualquier cuenta/wallet.
 *
 * status:
 *   'supported' → parseada y procesada en FIFO
 *   'ignored'   → reconocida pero sin impacto fiscal
 *   'pending'   → reconocida pero no implementada todavía
 */

export type BinanceAccount = 'Spot' | 'Funding' | 'Cross Margin' | 'Isolated Margin' | 'Futures';

export type OpStatus = 'supported' | 'ignored' | 'pending';

export interface BinanceOperation {
  csvLabel:     string;
  internalType: string;
  status:       OpStatus;
  notes?:       string;
}

// ── Catálogo account-agnostic ──────────────────────────────────────────────
// Una misma operación puede aparecer en Spot, Funding, Strategy, etc.
// El parser resuelve el tipo por lógica propia; esta lista solo se usa
// para validar que la etiqueta CSV sea conocida antes de importar.
export const ALL_BINANCE_OPERATIONS: BinanceOperation[] = [
  // Compras / ventas
  { csvLabel: 'Deposit',                              internalType: 'DEPOSIT_FIAT',      status: 'supported' },
  { csvLabel: 'Withdraw',                             internalType: 'WITHDRAW',           status: 'supported' },
  { csvLabel: 'Buy Crypto With Fiat',                 internalType: 'BUY',               status: 'supported' },
  { csvLabel: 'Buy Crypto With Card',                 internalType: 'BUY',               status: 'supported' },
  { csvLabel: 'Transaction Buy',                      internalType: 'BUY',               status: 'supported' },
  { csvLabel: 'Transaction Spend',                    internalType: 'BUY',               status: 'supported',  notes: 'Fila de coste en Transaction Buy' },
  { csvLabel: 'Transaction Fee',                      internalType: 'BUY',               status: 'supported',  notes: 'Fila de comisión en Transaction Buy/Sold' },
  { csvLabel: 'Transaction Sold',                     internalType: 'SELL',              status: 'supported' },
  { csvLabel: 'Transaction Revenue',                  internalType: 'SELL',              status: 'supported',  notes: 'Fila de ingreso en Transaction Sold' },
  { csvLabel: 'Transaction Related',                  internalType: 'BUY',               status: 'supported',  notes: 'Compra EUR→cripto con depósito inmediato — patrón pre-OCBS' },
  { csvLabel: 'Binance Convert',                      internalType: 'BUY',               status: 'supported',  notes: 'Swap EUR→cripto o cripto→cripto' },
  { csvLabel: 'Small Assets Exchange BNB',            internalType: 'BUY',               status: 'supported',  notes: 'Conversión de dust a BNB' },
  { csvLabel: 'Convert Fiat to Crypto OCBS',          internalType: 'BUY',               status: 'supported',  notes: 'Variante OCBS de compra EUR→cripto' },
  { csvLabel: 'Fiat Withdraw',                        internalType: 'WITHDRAW_FIAT',     status: 'supported' },

  // Transferencias internas (Spot↔Funding, Spot↔Strategy, Spot↔Margin)
  { csvLabel: 'Transfer Between Main and Funding Wallet',                 internalType: 'TRANSFER_INTERNAL', status: 'supported', notes: 'Spot↔Funding' },
  { csvLabel: 'Transfer Between Spot and Funding',                        internalType: 'TRANSFER_INTERNAL', status: 'supported', notes: 'Alias nuevo de Transfer Between Main and Funding Wallet' },
  { csvLabel: 'Transfer Between Spot and Strategy Account',               internalType: 'TRANSFER_INTERNAL', status: 'supported', notes: 'Spot↔Strategy' },
  { csvLabel: 'Transfer Between Spot and Strategy',                       internalType: 'TRANSFER_INTERNAL', status: 'supported', notes: 'Alias nuevo de Transfer Between Spot and Strategy Account' },
  { csvLabel: 'Transfer Between Main Account/Futures and Margin Account', internalType: 'TRANSFER_INTERNAL', status: 'supported', notes: 'Spot↔Margin' },

  // Staking
  { csvLabel: 'Staking Purchase',              internalType: 'STAKING_LOCK',          status: 'supported', notes: 'Bloqueo para staking' },
  { csvLabel: 'Staking Redemption',            internalType: 'STAKING_UNLOCK',        status: 'supported', notes: 'Desbloqueo de staking' },
  { csvLabel: 'Staking Rewards',               internalType: 'STAKING_REWARD',        status: 'supported', notes: 'Rendimiento PoS — art. 25.4 LIRPF' },

  // ETH 2.0 Staking
  { csvLabel: 'ETH 2.0 Staking',              internalType: 'BUY',                   status: 'supported', notes: 'Swap ETH→BETH (1:1)' },
  { csvLabel: 'ETH 2.0 Staking Withdrawals',  internalType: 'BUY',                   status: 'supported', notes: 'Swap BETH→ETH (1:1)' },
  { csvLabel: 'ETH 2.0 Staking Rewards',      internalType: 'STAKING_REWARD',        status: 'supported', notes: 'Rendimiento validador ETH2 (BETH) — art. 25.4 LIRPF' },

  // Launchpool
  { csvLabel: 'Launchpool Subscription',            internalType: 'LAUNCHPOOL_LOCK',   status: 'supported', notes: 'Bloqueo de activo en Launchpool' },
  { csvLabel: 'Launchpool Redemption',              internalType: 'LAUNCHPOOL_UNLOCK', status: 'supported', notes: 'Desbloqueo de Launchpool' },
  { csvLabel: 'Launchpool Subscription/Redemption', internalType: 'LAUNCHPOOL_LOCK',   status: 'supported', notes: 'Label combinada nueva Binance — negativo=lock, positivo=unlock (parser resuelve por signo)' },
  { csvLabel: 'Launchpool Interest',                internalType: 'STAKING_REWARD',   status: 'pending',   notes: 'Rendimiento Launchpool — clasificación LIRPF en revisión' },
  { csvLabel: 'Launchpool Airdrop - User Claim Distribution', internalType: 'AIRDROP', status: 'supported' },
  { csvLabel: 'Launchpool Airdrop - System Distribution',     internalType: 'AIRDROP', status: 'supported' },

  // Simple Earn / Savings
  { csvLabel: 'Simple Earn Flexible Interest',  internalType: 'LENDING_INTEREST',        status: 'supported', notes: 'Interés préstamo flexible — art. 25.2 LIRPF' },
  { csvLabel: 'Simple Earn Locked Rewards',     internalType: 'LENDING_INTEREST_LOCKED', status: 'supported', notes: 'Interés depósito bloqueado — art. 25.2 LIRPF' },
  { csvLabel: 'Savings Interest',               internalType: 'LENDING_INTEREST',        status: 'pending',   notes: 'Interés savings — clasificación LIRPF en revisión' },
  { csvLabel: 'POS savings interest',           internalType: 'LENDING_INTEREST',        status: 'pending',   notes: 'Interés POS savings — clasificación LIRPF en revisión' },
  { csvLabel: 'BNB Vault Rewards',              internalType: 'STAKING_REWARD',          status: 'pending',   notes: 'Rendimiento BNB Vault — clasificación LIRPF en revisión' },

  // Cashback y comisiones
  { csvLabel: 'Strategy Trading Fee Rebate',    internalType: 'CASHBACK',  status: 'supported', notes: 'BNB negativo → FEE_EXCHANGE; positivos → CASHBACK' },
  { csvLabel: 'Cash Voucher Distribution',      internalType: 'CASHBACK',  status: 'supported' },
  { csvLabel: 'Cashback Voucher',               internalType: 'CASHBACK',  status: 'supported' },
  { csvLabel: 'Commission Rebate',              internalType: 'CASHBACK',  status: 'supported' },
  { csvLabel: 'Commission History',             internalType: 'CASHBACK',  status: 'supported', notes: 'Comisión de referido' },
  { csvLabel: 'Referral Kickback',              internalType: 'CASHBACK',  status: 'supported' },
  { csvLabel: 'Mission Reward Distribution',    internalType: 'CASHBACK',  status: 'supported' },
  { csvLabel: 'Crypto Box',                     internalType: 'CASHBACK',  status: 'supported' },

  // Airdrops y distribuciones
  { csvLabel: 'Airdrop Assets',                 internalType: 'AIRDROP',   status: 'supported' },
  { csvLabel: 'Asset Recovery',                 internalType: 'AIRDROP',   status: 'supported' },
  { csvLabel: 'Distribution',                   internalType: 'AIRDROP',   status: 'supported' },
  { csvLabel: 'Token Swap - Distribution',      internalType: 'AIRDROP',   status: 'supported' },

  // Fees
  { csvLabel: 'BNB Fee Deduction',              internalType: 'FEE_EXCHANGE', status: 'supported', notes: 'Fee de exchange pagada en BNB — evento imponible' },

  // Margin
  { csvLabel: 'Margin Fee',                                              internalType: 'FEE_EXCHANGE', status: 'supported', notes: 'Interés de margen pagado en cripto' },
  { csvLabel: 'Margin Loan',                                             internalType: 'IGNORED',      status: 'supported', notes: 'Préstamo recibido — no hecho imponible' },
  { csvLabel: 'Margin Repayment',                                        internalType: 'FEE_EXCHANGE', status: 'supported', notes: 'Devolución préstamo' },
  { csvLabel: 'Isolated Margin Loan',                                    internalType: 'IGNORED',      status: 'supported', notes: 'Préstamo recibido — no hecho imponible' },
  { csvLabel: 'Isolated Margin Repayment',                               internalType: 'FEE_EXCHANGE', status: 'supported', notes: 'Devolución préstamo' },
  { csvLabel: 'Isolated Margin Liquidation - Fee',                       internalType: 'FEE_EXCHANGE', status: 'supported', notes: 'Fee de liquidación — evento imponible' },
  { csvLabel: 'Cross Margin Liquidation - Repayment',                    internalType: 'FEE_EXCHANGE', status: 'supported', notes: 'Repago de deuda' },
  { csvLabel: 'Cross Margin Liquidation - Small Assets Takeover',        internalType: 'SELL',         status: 'supported', notes: 'Venta forzosa de colateral' },

  // Ignoradas (asientos contables internos sin impacto fiscal)
  { csvLabel: 'Simple Earn Flexible Subscription',    internalType: 'STAKING_LOCK',   status: 'supported', notes: 'Bloqueo en Simple Earn Flexible — movimiento Spot→Earn sin evento fiscal' },
  { csvLabel: 'Simple Earn Flexible Redemption',      internalType: 'STAKING_UNLOCK', status: 'supported', notes: 'Desbloqueo de Simple Earn Flexible — movimiento Earn→Spot sin evento fiscal' },
  { csvLabel: 'Simple Earn Locked Subscription',      internalType: 'STAKING_LOCK',   status: 'supported', notes: 'Bloqueo en Simple Earn Locked — equivalente a Staking Purchase' },
  { csvLabel: 'Simple Earn Locked Redemption',        internalType: 'STAKING_UNLOCK', status: 'supported', notes: 'Desbloqueo de Simple Earn Locked — equivalente a Staking Redemption' },
  { csvLabel: 'Token Swap - Redenomination/Rebranding', internalType: 'IGNORED', status: 'ignored' },
  { csvLabel: 'Dual Investment - Subscribe',          internalType: 'IGNORED', status: 'ignored' },
  { csvLabel: 'Dual Investment - Settlement',         internalType: 'IGNORED', status: 'ignored' },
  { csvLabel: 'Fiat OCBS - Add Fiat and Fees',        internalType: 'IGNORED', status: 'ignored', notes: 'Asiento contable OCBS redundante' },
  { csvLabel: 'Deposit Fiat OCBS',                    internalType: 'IGNORED', status: 'ignored', notes: 'Asiento contable OCBS redundante' },
];

// ── Mapeo cuenta CSV → nombre de wallet en la DB ──────────────────────────
export const ACCOUNT_TO_WALLET: Record<string, string> = {
  'Spot':             'Binance Spot',
  'Funding':          'Binance Funding',
  'Cross Margin':     'Binance Cross Margin',
  'Isolated Margin':  'Binance Isolated Margin',
  'Strategy':         'Binance Strategy',
};

// ── Destino de cada tipo de transferencia interna ──────────────────────────
export const TRANSFER_DESTINATIONS: Record<string, Record<string, string>> = {
  'Transfer Between Main and Funding Wallet': {
    'Spot':    'Binance Funding',
    'Funding': 'Binance Spot',
  },
  'Transfer Between Spot and Funding': {
    'Spot':    'Binance Funding',
    'Funding': 'Binance Spot',
  },
  'Transfer Between Spot and Strategy Account': {
    'Spot':     'Binance Strategy',
    'Strategy': 'Binance Spot',
  },
  'Transfer Between Spot and Strategy': {
    'Spot':     'Binance Strategy',
    'Strategy': 'Binance Spot',
  },
  'Transfer Between Main Account/Futures and Margin Account': {
    'Spot':             'Binance Cross Margin',
    'Cross Margin':     'Binance Spot',
    'Funding':          'Binance Cross Margin',
    'Isolated Margin':  'Binance Spot',
  },
};

// ── Exports para compatibilidad con validator, parser e importer ───────────
export const ALL_KNOWN_OPERATIONS = new Set([
  ...ALL_BINANCE_OPERATIONS.map(op => op.csvLabel),
  'Margin Short Sale',
]);

export const ALL_IGNORED_OPERATIONS = new Set(
  ALL_BINANCE_OPERATIONS.filter(op => op.status === 'ignored').map(op => op.csvLabel)
);

// Colores por cuenta (para la UI)
export const ACCOUNT_COLORS: Record<string, string> = {
  'Spot':            '#6366f1',
  'Funding':         '#8b5cf6',
  'Cross Margin':    '#f59e0b',
  'Isolated Margin': '#e74c3c',
  'Futures':         '#e74c3c',
  'Strategy':        '#8B5CF6',
};
