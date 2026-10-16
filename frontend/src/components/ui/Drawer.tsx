import { useEffect, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { useModalA11y } from '../../hooks/useModalA11y'

// Panel lateral (#272): se abre a la derecha sin perder la página de fondo.
// Mismo comportamiento accesible que los modales (useModalA11y): Esc cierra,
// el foco queda atrapado dentro y vuelve al elemento que lo abrió al cerrar.
export function Drawer({ onClose, labelledBy, initialFocusRef, children }: {
  onClose: () => void
  labelledBy: string
  initialFocusRef?: RefObject<HTMLElement | null>
  children: ReactNode
}) {
  const panelRef = useModalA11y<HTMLDivElement>(onClose, initialFocusRef)

  // Bloquea el scroll del fondo mientras está abierto y restaura el valor previo.
  useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previous }
  }, [])

  return createPortal(
    <div className="fixed inset-0 z-50 flex justify-end bg-black/45 backdrop-blur-[2px] animate-page-in"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby={labelledBy}
        className="drawer-in h-full w-full max-w-xl bg-background-card border-l border-border shadow-2xl flex flex-col overflow-hidden">
        {children}
      </div>
    </div>,
    document.body,
  )
}
