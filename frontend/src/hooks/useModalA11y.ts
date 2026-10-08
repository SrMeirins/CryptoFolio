import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react'

const FOCUSABLE_SELECTOR = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'

/**
 * Comportamiento de accesibilidad común a todos los modales de la app:
 * Escape cierra, Tab/Shift+Tab quedan atrapados dentro del diálogo, el foco
 * entra a `initialFocusRef` (o al primer elemento enfocable del diálogo si
 * no se pasa) al abrir, y se restaura al elemento que lo tenía antes al
 * cerrar. Devuelve el ref que hay que poner en el contenedor del diálogo.
 *
 * `onClose` se guarda en un ref (igual que `useClickOutside`) para que el
 * efecto se ejecute solo al montar, no en cada render por una nueva
 * identidad de función — habitual cuando el padre pasa un `onClose` inline.
 */
export function useModalA11y<T extends HTMLElement = HTMLDivElement>(
  onClose: () => void,
  initialFocusRef?: RefObject<HTMLElement | null>,
): RefObject<T> {
  const dialogRef = useRef<T>(null)
  const onCloseRef = useRef(onClose)
  // Se actualiza tras cada render (no durante él: React prohíbe escribir refs en render).
  useLayoutEffect(() => { onCloseRef.current = onClose })

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null
    const initial = initialFocusRef?.current
      ?? dialogRef.current?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR)
    initial?.focus()

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        onCloseRef.current()
        return
      }
      if (e.key !== 'Tab' || !dialogRef.current) return
      const focusable = dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
      if (focusable.length === 0) return
      const first = focusable[0]
      const last  = focusable[focusable.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      previouslyFocused?.focus()
    }
  }, [initialFocusRef])

  return dialogRef
}
