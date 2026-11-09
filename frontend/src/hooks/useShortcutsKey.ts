import { useEffect } from 'react'
import { useShortcutsStore } from '../store/shortcutsStore'
import { isTypingTarget } from '../utils/fiscalHeader'

// Tecla «?» del panel de atajos (#535).
/** Abre el panel con «?» en cualquier pantalla, salvo al escribir o con un diálogo abierto. */
export function useShortcutsKey(): void {
  const setOpen = useShortcutsStore(s => s.setOpen)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== '?' || e.altKey || e.ctrlKey || e.metaKey) return
      if (isTypingTarget(document.activeElement)) return
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) return
      e.preventDefault()
      setOpen(true)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setOpen])
}
