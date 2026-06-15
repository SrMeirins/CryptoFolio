/**
 * Taxonomía oficial de cuentas y operaciones de Binance CSV.
 * Esta es la fuente de verdad única del módulo de importación.
 *
 * status:
 *   'supported' → parseada y procesada en FIFO
 *   'ignored'   → reconocida pero sin impacto fiscal (transferencias internas)
 *   'pending'   → reconocida pero no implementada todavía
 */

export type BinanceAccount = 'Spot' | 'Funding' | 'Cross Margin' | 'Isolated Margin' | 'Futures';

export type OpStatus = 'supported' | 'ignored' | 'pending';

export interface BinanceOperation {
  csvLabel:     string;
  internalType: string;  // operation_type de la DB, o 'IGNORED'
  status:       OpStatus;
  notes?:       string;
}

// ── Spot ───────────────────────────────────────────────────────────────────
export const SPOT_OPERATIONS: BinanceOperation[] = [
  { csvLabel: 'Deposit',                                                    internalType: 'DEPOSIT_FIAT',     status: 'supported' },
  { csvLabel: 'Withdraw',                                                   internalType: 'WITHDRAW',         status: 'supported' },
  { csvLabel: 'Buy Crypto With Fiat',                                       internalType: 'BUY',              status: 'supported' },
  { csvLabel: 'Transaction Buy',                                            internalType: 'BUY',              status: 'supported' },
  { csvLabel: 'Transaction Spend',                                          internalType: 'BUY',              status: 'supported',  notes: 'Fila de coste en Transaction Buy' },
  { csvLabel: 'Transaction Fee',                                            internalType: 'BUY',              status: 'supported',  notes: 'Fila de comisión en Transaction Buy/Sold' },
  { csvLabel: 'Transaction Sold',                                           internalType: 'SELL',             status: 'supported' },
  { csvLabel: 'Transaction Revenue',                                        internalType: 'SELL',             status: 'supported',  notes: 'Fila de ingreso en Transaction Sold' },
  { csvLabel: 'Binance Convert',                                            internalType: 'BUY',              status: 'supported',  notes: 'Swap EUR→cripto o cripto→cripto' },
  { csvLabel: 'Small Assets Exchange BNB',                                  internalType: 'BUY',              status: 'supported',  notes: 'Conversión de dust a BNB' },
  { csvLabel: 'Transfer Between Main and Funding Wallet',                   internalType: 'TRANSFER_INTERNAL', status: 'supported', notes: 'Movimiento Spot↔Funding — mueve lotes entre sub-cuentas' },
  { csvLabel: 'Transfer Between Spot and Funding',                          internalType: 'TRANSFER_INTERNAL', status: 'supported', notes: 'Alias nuevo Binance para Transfer Between Main and Funding Wallet' },
  { csvLabel: 'Transfer Between Main Account/Futures and Margin Account',   internalType: 'TRANSFER_INTERNAL', status: 'supported', notes: 'Movimiento Spot↔Margin — mueve lotes entre sub-cuentas' },
  // Retiro de fiat al banco (no hay lote FIFO que mover, solo tracking contable)
  { csvLabel: 'Fiat Withdraw',                                              internalType: 'WITHDRAW_FIAT',     status: 'supported' },
  // Compra con tarjeta/banco — mismo patrón que Buy Crypto With Fiat
  { csvLabel: 'Buy Crypto With Card',                                       internalType: 'BUY',               status: 'supported' },
  // Sistema OCBS de Binance — variante de compra con EUR
  { csvLabel: 'Convert Fiat to Crypto OCBS',                                internalType: 'BUY',               status: 'supported', notes: 'Variante OCBS de compra EUR→cripto' },
  // Fee rebate del grid/strategy trading — BNB fee pagada + rebate en el activo negociado
  { csvLabel: 'Strategy Trading Fee Rebate',             internalType: 'CASHBACK',          status: 'supported', notes: 'BNB negativo → FEE_EXCHANGE; positivos → CASHBACK (rebate de fee)' },
  // Transferencia entre Spot y la sub-cuenta de Strategy Trading (grid bots, etc.)
  { csvLabel: 'Transfer Between Spot and Strategy Account', internalType: 'TRANSFER_INTERNAL', status: 'supported', notes: 'Movimiento Spot↔Strategy — mueve lotes entre sub-cuentas' },
  { csvLabel: 'Transfer Between Spot and Strategy',         internalType: 'TRANSFER_INTERNAL', status: 'supported', notes: 'Alias nuevo Binance para Transfer Between Spot and Strategy Account' },
  // Compra vía depósito directo (patrón antiguo Binance, pre-OCBS/2022)
  // El "Deposit EUR" al mismo timestamp se ignora automáticamente (buildFundingDepositKeys en parser.ts)
  { csvLabel: 'Transaction Related',                                         internalType: 'BUY',               status: 'supported', notes: 'Compra EUR→cripto con depósito inmediato — patrón pre-OCBS' },
  // Asientos contables internos del sistema OCBS (ignorados, la compra ya se registra en la op. principal)
  { csvLabel: 'Fiat OCBS - Add Fiat and Fees',                              internalType: 'IGNORED',           status: 'ignored',   notes: 'Asiento contable OCBS, redundante con Buy Crypto With Card' },
  { csvLabel: 'Deposit Fiat OCBS',                                          internalType: 'IGNORED',           status: 'ignored',   notes: 'Asiento contable OCBS, redundante con Convert Fiat to Crypto OCBS' },
  // Cashback y comisiones de referido — pueden aparecer en Spot o Funding según el export
  { csvLabel: 'Commission History',                                         internalType: 'CASHBACK',          status: 'supported', notes: 'Comisión de referido — aparece en Spot en algunos exports' },
  { csvLabel: 'Cashback Voucher',                                           internalType: 'CASHBACK',          status: 'supported', notes: 'Voucher de cashback — aparece en Spot en algunos exports' },
  // Airdrops y distribuciones
  { csvLabel: 'Distribution',                                               internalType: 'AIRDROP',           status: 'supported', notes: 'Airdrop/distribución de tokens' },
  { csvLabel: 'Token Swap - Distribution',                                  internalType: 'AIRDROP',           status: 'supported', notes: 'Token Swap — aparece en Spot en algunos exports' },
  { csvLabel: 'Launchpool Airdrop - User Claim Distribution',               internalType: 'AIRDROP',           status: 'supported', notes: 'Distribución Launchpool reclamada por el usuario' },
  { csvLabel: 'Launchpool Airdrop - System Distribution',                   internalType: 'AIRDROP',           status: 'supported', notes: 'Distribución Launchpool asignada automáticamente por Binance' },
  // Fee standalone pagada en BNB
  { csvLabel: 'BNB Fee Deduction',                                          internalType: 'FEE_EXCHANGE',      status: 'supported', notes: 'Fee de exchange pagada en BNB — evento imponible' },
  // Bloqueo/desbloqueo para staking desde Spot (alternativa a Funding)
  { csvLabel: 'Staking Purchase',   internalType: 'STAKING_LOCK',   status: 'supported', notes: 'Bloqueo para staking desde Spot' },
  { csvLabel: 'Staking Redemption', internalType: 'STAKING_UNLOCK', status: 'supported', notes: 'Desbloqueo de staking desde Spot' },
  // Launchpool desde Spot
  { csvLabel: 'Launchpool Subscription',            internalType: 'LAUNCHPOOL_LOCK',   status: 'supported', notes: 'Bloqueo de activo en Launchpool desde Spot' },
  { csvLabel: 'Launchpool Redemption',              internalType: 'LAUNCHPOOL_UNLOCK', status: 'supported', notes: 'Desbloqueo de Launchpool desde Spot' },
  { csvLabel: 'Launchpool Subscription/Redemption', internalType: 'LAUNCHPOOL_LOCK',   status: 'supported', notes: 'Label combinada nueva Binance — negativo=lock, positivo=unlock (parser resuelve por signo)' },
  // Staking y rendimientos — aparecen en cuenta Spot en los exports de Binance.
  // El parser los reconoce y les asigna precio histórico al importar.
  // Clasificación LIRPF pendiente de refinamiento (ver docs/binance-operations-pendientes.md).
  { csvLabel: 'Staking Rewards',               internalType: 'STAKING_REWARD',   status: 'supported', notes: 'Rendimiento PoS — art. 25.4 LIRPF, base del ahorro' },
  { csvLabel: 'ETH 2.0 Staking Rewards',       internalType: 'STAKING_REWARD',   status: 'supported', notes: 'Rendimiento validador ETH2 (BETH) — art. 25.4 LIRPF' },
  { csvLabel: 'Simple Earn Flexible Interest',  internalType: 'LENDING_INTEREST', status: 'supported', notes: 'Interés préstamo flexible — art. 25.2 LIRPF, base del ahorro' },
  { csvLabel: 'Simple Earn Locked Rewards',     internalType: 'LENDING_INTEREST_LOCKED', status: 'supported', notes: 'Interés depósito bloqueado — art. 25.2 LIRPF, base del ahorro' },
];

// ── Funding ────────────────────────────────────────────────────────────────
export const FUNDING_OPERATIONS: BinanceOperation[] = [
  { csvLabel: 'Binance Convert',                                            internalType: 'BUY',              status: 'supported' },
  { csvLabel: 'Crypto Box',                                                 internalType: 'CASHBACK',         status: 'supported' },
  { csvLabel: 'Asset Recovery',                                             internalType: 'AIRDROP',          status: 'supported' },
  { csvLabel: 'Transfer Between Main and Funding Wallet',                   internalType: 'TRANSFER_INTERNAL', status: 'supported', notes: 'Movimiento Funding↔Spot — mueve lotes entre sub-cuentas' },
  // Rendimientos de Funding (Savings, Launchpool, BNB Vault)
  // Clasificación LIRPF pendiente de refinamiento.
  { csvLabel: 'Savings Interest',      internalType: 'LENDING_INTEREST', status: 'pending', notes: 'Interés savings — clasificación LIRPF en revisión' },
  { csvLabel: 'POS savings interest',  internalType: 'LENDING_INTEREST', status: 'pending', notes: 'Interés POS savings — clasificación LIRPF en revisión' },
  { csvLabel: 'Launchpool Interest',   internalType: 'STAKING_REWARD',   status: 'pending', notes: 'Rendimiento Launchpool — clasificación LIRPF en revisión' },
  { csvLabel: 'BNB Vault Rewards',     internalType: 'STAKING_REWARD',   status: 'pending', notes: 'Rendimiento BNB Vault — clasificación LIRPF en revisión' },
  // Bloqueo/desbloqueo de staking y ETH 2.0 — movimientos internos sin transmisión.
  // Registrados para evitar "operación desconocida". Tratamiento fiscal pendiente de estudio.
  { csvLabel: 'Staking Purchase',    internalType: 'STAKING_LOCK',      status: 'supported', notes: 'Bloqueo para staking — mueve lotes Funding → Binance Staking' },
  { csvLabel: 'Staking Redemption',    internalType: 'STAKING_UNLOCK',    status: 'supported', notes: 'Desbloqueo de staking — enlazado al STAKING_LOCK correspondiente via linked_tx_id' },
  { csvLabel: 'Launchpool Subscription',            internalType: 'LAUNCHPOOL_LOCK',   status: 'supported', notes: 'Bloqueo de activo en Launchpool (BNB, FDUSD...) — no-op FIFO' },
  { csvLabel: 'Launchpool Redemption',              internalType: 'LAUNCHPOOL_UNLOCK', status: 'supported', notes: 'Desbloqueo al salir del Launchpool — enlazado al LAUNCHPOOL_LOCK via linked_tx_id' },
  { csvLabel: 'Launchpool Subscription/Redemption', internalType: 'LAUNCHPOOL_LOCK',   status: 'supported', notes: 'Label combinada nueva Binance — negativo=lock, positivo=unlock (parser resuelve por signo)' },
  { csvLabel: 'Transfer Between Spot and Funding',  internalType: 'TRANSFER_INTERNAL', status: 'supported', notes: 'Alias nuevo Binance para Transfer Between Main and Funding Wallet' },
  { csvLabel: 'ETH 2.0 Staking',            internalType: 'BUY', status: 'supported', notes: 'Swap ETH→BETH (1:1) — se consume lote ETH y abre lote BETH al precio de mercado' },
  { csvLabel: 'ETH 2.0 Staking Withdrawals', internalType: 'BUY', status: 'supported', notes: 'Swap BETH→ETH (1:1) — se consumen lotes BETH y abre lote ETH al precio de mercado' },
  // Airdrops / cashback
  { csvLabel: 'Airdrop Assets',                                             internalType: 'AIRDROP',          status: 'supported' },
  { csvLabel: 'Cash Voucher Distribution',                                  internalType: 'CASHBACK',         status: 'supported' },
  { csvLabel: 'Cashback Voucher',                                           internalType: 'CASHBACK',         status: 'supported', notes: 'Voucher de cashback de Binance — promociones y campañas' },
  { csvLabel: 'Commission Rebate',                                          internalType: 'CASHBACK',         status: 'supported' },
  { csvLabel: 'Commission History',                                         internalType: 'CASHBACK',         status: 'supported', notes: 'Comisión de referido recibida en el activo operado por el referido' },
  { csvLabel: 'Referral Kickback',                                          internalType: 'CASHBACK',         status: 'supported' },
  { csvLabel: 'Mission Reward Distribution',                                internalType: 'CASHBACK',         status: 'supported' },
  // Movimientos internos (sin impacto fiscal)
  { csvLabel: 'Simple Earn Flexible Subscription',                          internalType: 'IGNORED',          status: 'ignored' },
  { csvLabel: 'Simple Earn Flexible Redemption',                            internalType: 'IGNORED',          status: 'ignored' },
  { csvLabel: 'Simple Earn Locked Subscription',                            internalType: 'IGNORED',          status: 'ignored' },
  { csvLabel: 'Simple Earn Locked Redemption',                              internalType: 'IGNORED',          status: 'ignored' },
  { csvLabel: 'Token Swap - Redenomination/Rebranding',                     internalType: 'IGNORED',          status: 'ignored' },
  { csvLabel: 'Token Swap - Distribution',                                  internalType: 'AIRDROP',          status: 'supported' },
  { csvLabel: 'Dual Investment - Subscribe',                                internalType: 'IGNORED',          status: 'ignored' },
  { csvLabel: 'Dual Investment - Settlement',                               internalType: 'IGNORED',          status: 'ignored' },
];

// ── Isolated Margin ────────────────────────────────────────────────────────
export const ISOLATED_MARGIN_OPERATIONS: BinanceOperation[] = [
  { csvLabel: 'Transaction Buy',                                            internalType: 'BUY',               status: 'supported' },
  { csvLabel: 'Transaction Spend',                                          internalType: 'BUY',               status: 'supported' },
  { csvLabel: 'Transaction Fee',                                            internalType: 'BUY',               status: 'supported' },
  { csvLabel: 'Transaction Sold',                                           internalType: 'SELL',              status: 'supported' },
  { csvLabel: 'Transaction Revenue',                                        internalType: 'SELL',              status: 'supported' },
  { csvLabel: 'Transfer Between Main Account/Futures and Margin Account',   internalType: 'TRANSFER_INTERNAL', status: 'supported' },
  { csvLabel: 'Isolated Margin Loan',       internalType: 'IGNORED',      status: 'supported', notes: 'Préstamo recibido — no hecho imponible' },
  { csvLabel: 'Isolated Margin Repayment',  internalType: 'FEE_EXCHANGE', status: 'supported', notes: 'Devolución préstamo — disposición patrimonial si hay lote FIFO' },
  { csvLabel: 'Isolated Margin Liquidation - Fee', internalType: 'FEE_EXCHANGE', status: 'supported', notes: 'Fee de liquidación — evento imponible' },
  { csvLabel: 'BNB Fee Deduction',          internalType: 'FEE_EXCHANGE', status: 'supported', notes: 'Positivo = devolución de fee original (CASHBACK); negativo = fee en BNB' },
];

// ── Cross Margin ───────────────────────────────────────────────────────────
export const CROSS_MARGIN_OPERATIONS: BinanceOperation[] = [
  { csvLabel: 'Transaction Buy',                                            internalType: 'BUY',              status: 'supported',  notes: 'Multifill pendiente' },
  { csvLabel: 'Transaction Spend',                                          internalType: 'BUY',              status: 'supported' },
  { csvLabel: 'Transaction Fee',                                            internalType: 'BUY',              status: 'supported' },
  { csvLabel: 'Transaction Sold',                                           internalType: 'SELL',             status: 'supported',  notes: 'Multifill pendiente' },
  { csvLabel: 'Transaction Revenue',                                        internalType: 'SELL',             status: 'supported' },
  { csvLabel: 'Transfer Between Main Account/Futures and Margin Account',   internalType: 'TRANSFER_INTERNAL', status: 'supported', notes: 'Movimiento Spot↔Margin' },
  { csvLabel: 'Margin Fee',                                                 internalType: 'FEE_EXCHANGE',      status: 'supported', notes: 'Interés de margen pagado en cripto — evento imponible en España' },
  { csvLabel: 'Margin Loan',       internalType: 'IGNORED',      status: 'supported', notes: 'Préstamo recibido — no hecho imponible. Guardado en historial para tracking.' },
  { csvLabel: 'Margin Repayment', internalType: 'FEE_EXCHANGE', status: 'supported', notes: 'Devolución préstamo — disposición patrimonial al precio de mercado si hay lote FIFO' },
  { csvLabel: 'Cross Margin Liquidation - Repayment',   internalType: 'FEE_EXCHANGE', status: 'supported', notes: 'Repago de deuda — disposición patrimonial al precio de mercado' },
  { csvLabel: 'Cross Margin Liquidation - Small Assets Takeover', internalType: 'SELL', status: 'supported', notes: 'Venta forzosa de colateral — transmisión patrimonial imponible' },
];

// ── Strategy (Grid/Bot trading) ────────────────────────────────────────────
export const STRATEGY_OPERATIONS: BinanceOperation[] = [
  { csvLabel: 'Transaction Buy',                          internalType: 'BUY',               status: 'supported', notes: 'Compra ejecutada por el bot de strategy trading' },
  { csvLabel: 'Transaction Spend',                        internalType: 'BUY',               status: 'supported', notes: 'Coste de la compra del bot' },
  { csvLabel: 'Transaction Fee',                          internalType: 'BUY',               status: 'supported', notes: 'Comisión de la operación del bot' },
  { csvLabel: 'Transaction Sold',                         internalType: 'SELL',              status: 'supported', notes: 'Venta ejecutada por el bot de strategy trading' },
  { csvLabel: 'Transaction Revenue',                      internalType: 'SELL',              status: 'supported', notes: 'Ingreso de la venta del bot' },
  { csvLabel: 'Transfer Between Spot and Strategy Account', internalType: 'TRANSFER_INTERNAL', status: 'supported', notes: 'Capital entrante/saliente de la sub-cuenta Strategy' },
  { csvLabel: 'Transfer Between Spot and Strategy',         internalType: 'TRANSFER_INTERNAL', status: 'supported', notes: 'Alias nuevo Binance para Transfer Between Spot and Strategy Account' },
];

// ── Mapeo cuenta CSV → nombre de wallet en la DB ──────────────────────────
// Permite al importer asignar el wallet_id correcto a cada transacción.
export const ACCOUNT_TO_WALLET: Record<string, string> = {
  'Spot':             'Binance Spot',
  'Funding':          'Binance Funding',
  'Cross Margin':     'Binance Cross Margin',
  'Isolated Margin':  'Binance Isolated Margin',
  'Strategy':         'Binance Strategy',
};

// ── Destino de cada tipo de transferencia interna ──────────────────────────
// Para TRANSFER_INTERNAL: dado cuenta origen → nombre de wallet destino.
export const TRANSFER_DESTINATIONS: Record<string, Record<string, string>> = {
  'Transfer Between Main and Funding Wallet': {
    'Spot':    'Binance Funding',
    'Funding': 'Binance Spot',
  },
  'Transfer Between Main Account/Futures and Margin Account': {
    'Spot':             'Binance Cross Margin',
    'Cross Margin':     'Binance Spot',
    'Funding':          'Binance Cross Margin',
    'Isolated Margin':  'Binance Spot',
  },
  'Transfer Between Spot and Strategy Account': {
    'Spot':     'Binance Strategy',
    'Strategy': 'Binance Spot',
  },
  'Transfer Between Spot and Strategy': {
    'Spot':     'Binance Strategy',
    'Strategy': 'Binance Spot',
  },
  'Transfer Between Spot and Funding': {
    'Spot':    'Binance Funding',
    'Funding': 'Binance Spot',
  },
};

// ── Índice global ──────────────────────────────────────────────────────────
export const ACCOUNT_OPERATIONS: Record<string, BinanceOperation[]> = {
  'Spot':             SPOT_OPERATIONS,
  'Funding':          FUNDING_OPERATIONS,
  'Cross Margin':     CROSS_MARGIN_OPERATIONS,
  'Isolated Margin':  ISOLATED_MARGIN_OPERATIONS,
  'Strategy':         STRATEGY_OPERATIONS,
};

// Set de todas las operaciones conocidas (para el validador)
// 'Margin Short Sale' es una etiqueta interna generada por el parser, no aparece en CSV
export const ALL_KNOWN_OPERATIONS = new Set([
  ...Object.values(ACCOUNT_OPERATIONS).flat().map(op => op.csvLabel),
  'Margin Short Sale',
]);

// Set de operaciones que se ignoran en FIFO (para el parser)
export const ALL_IGNORED_OPERATIONS = new Set(
  Object.values(ACCOUNT_OPERATIONS)
    .flat()
    .filter(op => op.status === 'ignored')
    .map(op => op.csvLabel)
);

// Colores por cuenta (para la UI)
export const ACCOUNT_COLORS: Record<string, string> = {
  'Spot':           '#6366f1',
  'Funding':        '#8b5cf6',
  'Cross Margin':   '#f59e0b',
  'Isolated Margin':'#e74c3c',
  'Futures':        '#e74c3c',
};
