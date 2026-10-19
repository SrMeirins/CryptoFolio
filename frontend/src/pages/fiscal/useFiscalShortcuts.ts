import { useEffect } from 'react'
import { isTypingTarget } from '../../utils/fiscalHeader'

/**
 * Atajos de Fiscal (#297): ← → cambian de año y 1–3 de pestaña. No actúan
 * mientras se escribe, con modificadores, con un diálogo abierto ni dentro de
 * un tablist (allí las flechas ya mueven entre pestañas).
 */
export function useFiscalShortcuts({ onYearStep, onTab }: { onYearStep: (step: -1 | 1) => void; onTab: (index: number) => void }) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return
      const el = document.activeElement
      if (isTypingTarget(el) || el?.closest('[role="tablist"], [role="dialog"], [role="menu"], [role="listbox"]')) return
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) return
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault()
        onYearStep(e.key === 'ArrowLeft' ? -1 : 1)
      } else if (/^[1-9]$/.test(e.key)) {
        onTab(Number(e.key) - 1)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onYearStep, onTab])
}
