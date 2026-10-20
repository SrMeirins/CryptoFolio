import type { PreviewTransaction } from './types'
import { formatNumber } from '../../utils/format'

export function txKey(tx: PreviewTransaction): string {
  return tx.rawRowHashes?.[0] ?? `${tx.timestamp}|${tx.asset}|${tx.amountNet}`
}

// ── Persistencia localStorage ──────────────────────────────────────────────
const STORAGE_KEY = 'ct_withdrawal_memory'

export function loadMemory(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') } catch { return {} }
}

export function saveMemory(assetAccount: string, dest: string) {
  try {
    const m = loadMemory(); m[assetAccount] = dest
    localStorage.setItem(STORAGE_KEY, JSON.stringify(m))
  } catch { /* ignore */ }
}

export function fmtAmt(n: number): string {
  if (Math.abs(n) >= 1000) return formatNumber(n, 4)
  if (Math.abs(n) >= 1)    return formatNumber(n, 6, 6)
  return formatNumber(n, 8, 8)
}
