import { Transaction } from './constants';

const opPriority = (op: string): number => {
  switch (op) {
    case 'MARGIN_BORROW': return 0;
    case 'AIRDROP': case 'DEPOSIT_CRYPTO': case 'STAKING_REWARD': case 'MINING_REWARD':
    case 'LENDING_INTEREST': case 'LENDING_INTEREST_LOCKED': case 'CASHBACK': case 'FORK': return 1;
    case 'TRANSFER_INTERNAL': return 2;
    case 'SELL': case 'SELL_FIAT': case 'SELL_CRYPTO': case 'GIFT_SENT': case 'LOST': return 3;
    case 'BUY': case 'BUY_FIAT': case 'BUY_CRYPTO': return 4;
    case 'WITHDRAW': return 5;
    case 'FEE_EXCHANGE': case 'FEE': case 'FEE_NETWORK': return 6;
    case 'MARGIN_REPAY': return 7;
    default: return 8;
  }
};

// Binance short-sale quirk: el CSV registra el SELL 1-2 segundos ANTES del MARGIN_BORROW
// correspondiente, pero económicamente el préstamo precede a la venta.
// Corrección en memoria: si un MARGIN_BORROW ocurre ≤5s después de un SELL del mismo activo
// en la misma wallet, adelantamos su timestamp a 1ms antes del SELL.
// Usamos lista por clave (no Map de un solo valor) para manejar múltiples SELLs del mismo activo.
// Cada SELL solo puede emparejarse con UN MARGIN_BORROW (evita que dos préstamos
// distintos "roben" el mismo SELL). Se elige el SELL más cercano en el tiempo
// dentro de la ventana, no el primero encontrado — los MARGIN_BORROW se procesan
// en orden cronológico (orden natural de `transactions`), así que el préstamo más
// antiguo siempre tiene primera opción sobre los SELL disponibles.
function correctMarginBorrowTimestamps(transactions: Transaction[]): void {
  const sellsByKey = new Map<string, Transaction[]>(); // key = `${walletId}|${asset}`
  for (const tx of transactions) {
    if (tx.operation_type === 'SELL' || tx.operation_type === 'SELL_FIAT' || tx.operation_type === 'SELL_CRYPTO') {
      const key = `${tx.wallet_id}|${tx.asset}`;
      if (!sellsByKey.has(key)) sellsByKey.set(key, []);
      sellsByKey.get(key)!.push(tx);
    }
  }

  const usedSells = new Set<string>();
  for (const tx of transactions) {
    if (tx.operation_type !== 'MARGIN_BORROW') continue;
    const sells = sellsByKey.get(`${tx.wallet_id}|${tx.asset}`) ?? [];
    let closestSell: Transaction | null = null;
    let closestDiff = Infinity;
    for (const s of sells) {
      if (usedSells.has(s.id)) continue;
      const diff = tx.timestamp.getTime() - s.timestamp.getTime();
      if (diff > 0 && diff <= 5000 && diff < closestDiff) {
        closestSell = s;
        closestDiff = diff;
      }
    }
    if (closestSell) {
      usedSells.add(closestSell.id);
      tx.timestamp = new Date(closestSell.timestamp.getTime() - 1);
    }
  }
}

// Aplica la corrección del quirk de Binance y reordena (estable: conserva el
// orden de llegada — el de la query SQL con su propio CASE de prioridad —
// como desempate cuando dos transacciones comparten timestamp exacto).
export function reorderTransactions(transactions: Transaction[]): void {
  correctMarginBorrowTimestamps(transactions);
  transactions.sort((a, b) => {
    const tDiff = a.timestamp.getTime() - b.timestamp.getTime();
    if (tDiff !== 0) return tDiff;
    return opPriority(a.operation_type) - opPriority(b.operation_type);
  });
}
