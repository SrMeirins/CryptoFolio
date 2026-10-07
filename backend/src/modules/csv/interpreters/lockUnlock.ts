import { RawCsvRow, ParsedTransaction, OperationType } from '../types';
import { abs } from '../csvUtils';

// Bloqueo/desbloqueo de fondos en staking/launchpool/simple-earn: los lotes
// permanecen en la wallet de origen (no-op FIFO), solo se registra el
// movimiento. Los 8 patrones de Binance comparten la misma forma (una fila
// de salida para lock, una de entrada para unlock) — antes eran 8 bloques
// casi idénticos de ~12 líneas cada uno; colapsados aquí en una tabla +
// una función genérica.
interface LockUnlockTrigger {
  matches: (firstOp: string, group: RawCsvRow[]) => boolean;
  direction: 'lock' | 'unlock';
  kind: 'STAKING' | 'LAUNCHPOOL';
}

const TRIGGERS: LockUnlockTrigger[] = [
  { matches: (op) => op === 'Staking Purchase', direction: 'lock', kind: 'STAKING' },
  { matches: (op) => op === 'Staking Redemption', direction: 'unlock', kind: 'STAKING' },
  { matches: (op) => op === 'Simple Earn Flexible Subscription', direction: 'lock', kind: 'STAKING' },
  { matches: (op) => op === 'Simple Earn Flexible Redemption', direction: 'unlock', kind: 'STAKING' },
  { matches: (op) => op === 'Simple Earn Locked Subscription', direction: 'lock', kind: 'STAKING' },
  { matches: (op) => op === 'Simple Earn Locked Redemption', direction: 'unlock', kind: 'STAKING' },
  // "Launchpool Subscription/Redemption" es la label combinada de Binance (2025+):
  // negativo = suscripción (lock), positivo = redención (unlock) — se resuelve por signo.
  {
    matches: (op, group) => op === 'Launchpool Subscription' ||
      (op === 'Launchpool Subscription/Redemption' && group.some((r) => r.change < 0)),
    direction: 'lock', kind: 'LAUNCHPOOL',
  },
  {
    matches: (op, group) => op === 'Launchpool Redemption' ||
      (op === 'Launchpool Subscription/Redemption' && group.some((r) => r.change > 0)),
    direction: 'unlock', kind: 'LAUNCHPOOL',
  },
];

const OPERATION_TYPE: Record<'STAKING' | 'LAUNCHPOOL', Record<'lock' | 'unlock', OperationType>> = {
  STAKING:    { lock: 'STAKING_LOCK',    unlock: 'STAKING_UNLOCK' },
  LAUNCHPOOL: { lock: 'LAUNCHPOOL_LOCK', unlock: 'LAUNCHPOOL_UNLOCK' },
};

// Devuelve null si firstOp no dispara ningún patrón de lock/unlock conocido
// (el caller sigue probando el resto de interpretadores).
export function tryInterpretLockUnlock(
  firstOp: string, group: RawCsvRow[]
): ParsedTransaction[] | null {
  const trigger = TRIGGERS.find((t) => t.matches(firstOp, group));
  if (!trigger) return null;

  // lock: fila única negativa (fondos que salen a bloquearse).
  // unlock: fila única positiva (fondos que vuelven a estar disponibles).
  const row = trigger.direction === 'lock'
    ? group.find((r) => r.change < 0)
    : group.find((r) => r.change > 0);
  if (!row) return [];

  return [{
    operationType: OPERATION_TYPE[trigger.kind][trigger.direction],
    timestamp:     row.time,
    asset:         row.coin,
    amount:        abs(row.change),
    amountNet:     abs(row.change),
    account:       row.account,
    notes:         firstOp,
    subTradeCount: group.length,
    rawRowHashes:  group.map((r) => r.rowHash),
  }];
}
