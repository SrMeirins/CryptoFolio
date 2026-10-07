import { RawCsvRow, ParsedTransaction } from '../types';
import { abs } from '../csvUtils';

// Mapa de operaciones de Binance → tipo fiscal (income/airdrops/cashback)
export const INCOME_OPS: Record<string, 'STAKING_REWARD' | 'LENDING_INTEREST' | 'LENDING_INTEREST_LOCKED' | 'CASHBACK' | 'AIRDROP'> = {
  'Staking Rewards':                'STAKING_REWARD',
  'ETH 2.0 Staking Rewards':        'STAKING_REWARD',
  'Simple Earn Flexible Interest':  'LENDING_INTEREST',
  'Simple Earn Locked Rewards':     'LENDING_INTEREST_LOCKED',
  'Savings Interest':               'LENDING_INTEREST',
  'POS savings interest':           'LENDING_INTEREST',
  'Launchpool Interest':            'STAKING_REWARD',
  'BNB Vault Rewards':              'STAKING_REWARD',
  'Airdrop Assets':                 'AIRDROP',
  'Asset Recovery':                 'AIRDROP',
  'Distribution':                   'AIRDROP',
  'Cash Voucher Distribution':      'CASHBACK',
  'Cashback Voucher':               'CASHBACK',
  'Commission Rebate':              'CASHBACK',
  'Commission History':             'CASHBACK',
  'Referral Kickback':              'CASHBACK',
  'Crypto Box':                     'CASHBACK',
  'Mission Reward Distribution':    'CASHBACK',
  'Launchpool Airdrop - User Claim Distribution': 'AIRDROP',
  'Launchpool Airdrop - System Distribution':     'AIRDROP',
  'Token Swap - Distribution':                    'AIRDROP',
};

export function interpretStandaloneFee(group: RawCsvRow[]): ParsedTransaction[] {
  // Grupo de Transaction Fee sin compra/venta asociada.
  // Ocurre con fees de margen, ajustes o fees de liquidaciones registradas aparte.
  // Cada fila es una fee independiente → FEE_EXCHANGE.
  return group.map((row) => ({
    operationType: 'FEE_EXCHANGE' as const,
    timestamp:     row.time,
    asset:         row.coin,
    amount:        abs(row.change),
    amountNet:     abs(row.change),
    account:       row.account,
    notes:         'Standalone Transaction Fee',
    subTradeCount: 1,
    rawRowHashes:  [row.rowHash],
  }));
}

export function interpretBnbFeeDeduction(group: RawCsvRow[]): ParsedTransaction[] {
  // BNB Fee Deduction negativo: fee standalone en BNB → FEE_EXCHANGE (evento imponible)
  // BNB Fee Deduction positivo (en Isolated Margin): devolución de la fee original
  //   pagada en FTT/USDT que Binance reemplazó con BNB. → CASHBACK (pequeño ingreso)
  return group.map((row) => ({
    operationType: row.change < 0 ? 'FEE_EXCHANGE' as const : 'CASHBACK' as const,
    timestamp:     row.time,
    asset:         row.coin,
    amount:        abs(row.change),
    amountNet:     abs(row.change),
    account:       row.account,
    notes:         row.change < 0
      ? 'BNB Fee Deduction — fee en BNB (evento imponible)'
      : 'BNB Fee Deduction — devolución de fee original (rebate)',
    subTradeCount: 1,
    rawRowHashes:  [row.rowHash],
  }));
}

export function interpretMarginFee(
  group: RawCsvRow[], hashes: string[], timestamp: Date, account: string, firstOp: string
): ParsedTransaction {
  // Interés/fee de margen pagado en cripto.
  // España: disposición patrimonial al precio de mercado → evento imponible.
  const row = group[0];
  return {
    operationType: 'FEE_EXCHANGE',
    timestamp,
    asset:    row.coin,
    amount:   abs(row.change),
    amountNet:abs(row.change),
    account,
    notes:    firstOp,
    subTradeCount: 1,
    rawRowHashes: hashes,
  };
}

export function interpretMarginBorrow(group: RawCsvRow[], firstOp: string, notes: string): ParsedTransaction[] {
  // Préstamo de margen — abre lote a precio de mercado para rastrear FIFO
  // cuando el activo prestado se vende o transfiere.
  return group.map((row) => ({
    operationType: 'MARGIN_BORROW' as const,
    timestamp:     row.time,
    asset:         row.coin,
    amount:        abs(row.change),
    amountNet:     abs(row.change),
    account:       row.account,
    notes,
    subTradeCount: 1,
    rawRowHashes:  [row.rowHash],
  }));
}

export function interpretMarginRepay(group: RawCsvRow[], notes: string): ParsedTransaction[] {
  // Devolución de préstamo — consume el lote sin registrar G/P (retorno de deuda).
  return group.map((row) => ({
    operationType: 'MARGIN_REPAY' as const,
    timestamp:     row.time,
    asset:         row.coin,
    amount:        abs(row.change),
    amountNet:     abs(row.change),
    account:       row.account,
    notes,
    subTradeCount: 1,
    rawRowHashes:  [row.rowHash],
  }));
}

export function interpretCrossMarginLiquidationTakeover(
  group: RawCsvRow[], hashes: string[], timestamp: Date, account: string
): ParsedTransaction {
  // Venta forzosa de colateral para cubrir la deuda.
  // La fila negativa es el activo vendido; la positiva son los proceeds recibidos.
  // Tratamiento España: transmisión patrimonial imponible (igual que una venta normal).
  const soldRow     = group.find((r) => r.change < 0);
  const proceedsRow = group.find((r) => r.change > 0);

  if (!soldRow || !proceedsRow) {
    throw new Error(`Cross Margin Liquidation - Small Assets Takeover incompleto en ${timestamp.toISOString()}`);
  }

  return {
    operationType: 'SELL',
    timestamp,
    asset:        soldRow.coin,
    amount:       abs(soldRow.change),
    amountNet:    abs(soldRow.change),
    costAsset:    proceedsRow.coin,
    costAmount:   abs(proceedsRow.change),
    pricePerUnit: abs(soldRow.change) > 0 ? abs(proceedsRow.change) / abs(soldRow.change) : 0,
    account,
    notes:        'Liquidación forzosa de margen — venta forzosa de colateral',
    subTradeCount: 1,
    rawRowHashes: hashes,
  };
}

export function interpretStrategyFeeRebate(group: RawCsvRow[]): ParsedTransaction[] {
  // Fee rebate de Binance Strategy: BNB negativo (fee pagada) + positivos (rebate recibido)
  return group.map(row => ({
    operationType: row.change < 0 ? 'FEE_EXCHANGE' as const : 'CASHBACK' as const,
    timestamp:     row.time,
    asset:         row.coin,
    amount:        abs(row.change),
    amountNet:     abs(row.change),
    account:       row.account,
    notes:         'Strategy Trading Fee Rebate',
    subTradeCount: 1,
    rawRowHashes:  [row.rowHash],
  }));
}

export function interpretIncomeOp(group: RawCsvRow[], firstOp: string): ParsedTransaction[] | null {
  const opType = INCOME_OPS[firstOp];
  const results: ParsedTransaction[] = [];

  for (const row of group) {
    if (row.change > 0) {
      // Ingreso normal — abre lote al precio de mercado
      results.push({
        operationType: opType,
        timestamp:     row.time,
        asset:         row.coin,
        amount:        abs(row.change),
        amountNet:     abs(row.change),
        account:       row.account,
        notes:         firstOp,
        subTradeCount: 1,
        rawRowHashes:  [row.rowHash],
      });
    } else if (firstOp === 'Asset Recovery' || firstOp === 'Token Swap - Distribution') {
      // Cambio negativo en Asset Recovery o Token Swap Distribution:
      // Binance retiró el activo de forma forzada (delisting, swap, confiscación).
      // Se registra como LOST: cierra el lote FIFO a 0 proceeds → pérdida patrimonial.
      results.push({
        operationType: 'LOST' as const,
        timestamp:     row.time,
        asset:         row.coin,
        amount:        abs(row.change),
        amountNet:     abs(row.change),
        account:       row.account,
        notes:         `${firstOp} — activo retirado por Binance`,
        subTradeCount: 1,
        rawRowHashes:  [row.rowHash],
      });
    }
    // Otras income ops con change negativo → ignorar (ajustes contables Binance)
  }

  return results.length > 0 ? results : null;
}
