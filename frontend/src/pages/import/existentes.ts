import type { PreviewTransaction, RetiroExistente } from './types'

// Retiros ya importados (#330): lógica pura de la revisión.

/** Forma de transacción de la vista previa para reutilizar la agrupación por dirección (txKey = id). */
export function comoTransaccion(e: RetiroExistente): PreviewTransaction {
  return {
    operationType: 'WITHDRAW', timestamp: e.timestamp, asset: e.asset, amount: e.amount, amountNet: e.amount,
    account: e.account, subTradeCount: 1, rawRowHashes: [e.id], destino: e.destino,
  }
}

/** Solo los destinos que cambian respecto al actual (y no quedan vacíos). */
export function cambiosDeDestino(actuales: Record<string, string>, elegidos: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(elegidos).filter(([id, d]) => d !== '' && d !== actuales[id]))
}

/**
 * Destino de cada retiro: el elegido por el usuario; si no, la wallet de una
 * dirección reconocida cuando sigue en «Wallets externas» o pendiente; si no, el actual.
 */
export function destinosEfectivos(
  grupos: readonly { ids: string[]; wallet: string | null }[],
  actuales: Record<string, string>,
  elegidos: Record<string, string>,
): Record<string, string> {
  const out: Record<string, string> = {}
  for (const g of grupos) {
    for (const id of g.ids) {
      const actual = actuales[id] ?? ''
      out[id] = elegidos[id] ?? (g.wallet && (actual === '' || actual === '__external__') ? g.wallet : actual)
    }
  }
  return out
}
