import { useEffect, useRef } from 'react'
import { historyShortcut, type HistoryShortcut } from './shortcutKeys'

/**
 * Atajos globales del Historial (#382). Con un diálogo modal abierto (ayuda,
 * edición o el panel de detalle) no actúan: el panel gestiona sus flechas.
 */
export function useHistoryShortcuts(handlers: Record<HistoryShortcut, () => void>) {
  const ref = useRef(handlers)
  useEffect(() => { ref.current = handlers })
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const dialogOpen = !!document.querySelector('[role="dialog"][aria-modal="true"]')
      const action = historyShortcut(e, document.activeElement, dialogOpen)
      if (!action) return
      e.preventDefault()
      ref.current[action]()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}
