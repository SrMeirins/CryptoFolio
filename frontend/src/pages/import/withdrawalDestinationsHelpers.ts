import type { PreviewTransaction } from './types'

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
  if (Math.abs(n) >= 1000) return n.toLocaleString('es-ES', { maximumFractionDigits: 4 })
  if (Math.abs(n) >= 1)    return n.toFixed(6)
  return n.toFixed(8)
}

export function destLabel(dest: string, coldWallets: { id: string; name: string; color: string }[]) {
  if (dest === '__lost__')     return { text: '💀 Pérdida',  cls: 'text-accent-red'   }
  if (dest === '__gift__')     return { text: '🎁 Regalo',   cls: 'text-accent-blue'  }
  if (dest === '__external__') return { text: '📱 Externa',  cls: 'text-gray-400'     }
  const w = coldWallets.find(w => w.id === dest)
  return w ? { text: w.name, cls: 'text-accent-green' } : { text: 'pendiente', cls: 'text-gray-600 italic' }
}
