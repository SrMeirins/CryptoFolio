import { RawCsvRow, ParsedTransaction } from '../types';
import { abs, FIAT_ASSETS } from '../csvUtils';

// Transferencias internas que se interpretan como TRANSFER_INTERNAL (negativo)
// o IGNORED (positivo — el FIFO crea el lote destino automáticamente)
export const INTERNAL_TRANSFER_OPS = new Set([
  'Transfer Between Main and Funding Wallet',
  'Transfer Between Spot and Funding',
  'Transfer Between Main Account/Futures and Margin Account',
  'Transfer Between Spot and Strategy Account',
  'Transfer Between Spot and Strategy',
  'Inter-Wallet Transfer',
]);

export function interpretDeposit(
  group: RawCsvRow[], hashes: string[], timestamp: Date, account: string, fundingDepositKeys: Set<string>
): ParsedTransaction {
  const row = group[0];
  // Depósitos que financian una compra "Transaction Related" al mismo timestamp.
  // El dinero SÍ entró desde el banco → DEPOSIT_FIAT para que fiat-balances lo contabilice.
  // La compra queda registrada por separado (BUY con costAsset=EUR), y ambos se cancelan.
  const fundingKey = `${timestamp.getTime()}|${account}|${row.coin}|${abs(row.change)}`;
  if (fundingDepositKeys.has(fundingKey)) {
    const isFundingFiat = FIAT_ASSETS.has(row.coin.toUpperCase());
    return {
      operationType: isFundingFiat ? 'DEPOSIT_FIAT' as const : 'IGNORED' as const,
      timestamp,
      asset:     row.coin,
      amount:    abs(row.change),
      amountNet: abs(row.change),
      account,
      notes:     'Depósito bancario para compra simultánea (Transaction Related)',
      subTradeCount: 1,
      rawRowHashes: hashes,
    };
  }
  // Fiat → DEPOSIT_FIAT (tracking contable, FIFO lo salta)
  // Cripto → DEPOSIT_CRYPTO: abre lote al precio de mercado estimado.
  //   La cantidad proviene de otra wallet: coste real de adquisición desconocido.
  //   Se marca para revisión manual del coste (needsCostReview).
  const isFiat = FIAT_ASSETS.has(row.coin.toUpperCase());
  return {
    operationType: isFiat ? 'DEPOSIT_FIAT' : 'DEPOSIT_CRYPTO',
    timestamp,
    asset: row.coin,
    amount: abs(row.change),
    amountNet: abs(row.change),
    account,
    notes: isFiat ? undefined : 'Depósito de cripto externo — coste de adquisición original desconocido. Verificar y ajustar si es necesario.',
    subTradeCount: 1,
    rawRowHashes: hashes,
    needsCostReview: !isFiat,
  };
}

export function interpretFiatWithdraw(
  group: RawCsvRow[], hashes: string[], timestamp: Date, account: string
): ParsedTransaction {
  // Retiro de EUR/fiat al banco. No hay lote FIFO que mover.
  // Se registra como WITHDRAW_FIAT para tracking contable (cuánto ha salido al banco).
  const row = group[0];
  return {
    operationType: 'WITHDRAW_FIAT',
    timestamp,
    asset: row.coin,
    amount: abs(row.change),
    amountNet: abs(row.change),
    account,
    subTradeCount: 1,
    rawRowHashes: hashes,
  };
}

export function interpretWithdraw(group: RawCsvRow[], timestamp: Date): ParsedTransaction[] {
  return group.map((row) => ({
    operationType: 'WITHDRAW' as const,
    timestamp,
    asset: row.coin,
    amount: abs(row.change),
    amountNet: abs(row.change),
    account: row.account,
    subTradeCount: 1,
    rawRowHashes: [row.rowHash],
  }));
}

// Transferencias internas entre sub-cuentas de Binance.
// Solo emitimos la fila de salida (change < 0) como TRANSFER_INTERNAL.
// La fila de entrada es redundante: el FIFO mueve el lote al destino automáticamente.
export function interpretInternalTransfer(group: RawCsvRow[], firstOp: string): ParsedTransaction[] {
  const outRows = group.filter((r) => r.change < 0);
  if (outRows.length === 0) return [];
  // Un activo distinto por fila saliente — pueden ser varios al mismo timestamp
  // (ej: al cerrar un grid bot Binance transfiere USDT + el activo residual a la vez)
  return outRows.map(outRow => ({
    operationType: 'TRANSFER_INTERNAL' as const,
    timestamp:     outRow.time,
    asset:         outRow.coin,
    amount:        abs(outRow.change),
    amountNet:     abs(outRow.change),
    account:       outRow.account,
    notes:         firstOp,
    subTradeCount: 1,
    rawRowHashes:  [outRow.rowHash],
  }));
}
