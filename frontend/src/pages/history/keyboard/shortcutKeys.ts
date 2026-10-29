import { isTypingTarget } from '../../../utils/fiscalHeader'

// Atajos globales del Historial (#382), con el mismo criterio que Fiscal: no
// actúan mientras se escribe, con modificadores (salvo la mayúscula de «?»),
// con un diálogo abierto ni dentro de menús, listas o pestañas.

export type HistoryShortcut = 'search' | 'help' | 'yearPrev' | 'yearNext'

export interface KeyLike { key: string; altKey: boolean; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; defaultPrevented: boolean }

export function historyShortcut(e: KeyLike, active: Element | null, dialogOpen: boolean): HistoryShortcut | null {
  if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || dialogOpen) return null
  if (isTypingTarget(active) || active?.closest('[role="tablist"], [role="menu"], [role="listbox"], [role="dialog"]')) return null
  if (e.key === '?') return 'help'
  if (e.shiftKey) return null
  if (e.key === '/') return 'search'
  if (e.key === 'ArrowLeft') return 'yearPrev'
  if (e.key === 'ArrowRight') return 'yearNext'
  return null
}

/** Fila a la que mueve una tecla en la tabla (foco itinerante), o null si no es de movimiento. */
export function nextRowIndex(key: string, current: number, count: number): number | null {
  if (count === 0) return null
  switch (key) {
    case 'ArrowDown': return Math.min(current + 1, count - 1)
    case 'ArrowUp': return Math.max(current - 1, 0)
    case 'Home': return 0
    case 'End': return count - 1
    default: return null
  }
}
