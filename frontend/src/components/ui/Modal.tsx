import { useEffect, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { useModalA11y } from '../../hooks/useModalA11y'
import { iconButtonClasses, modalOverlayClasses, modalPanelClasses, type ModalSize } from './classes'

// Modal base (#199): portal a <body>, capa de fondo, panel por tamaños,
// bloqueo del scroll de la página y accesibilidad común (Escape, foco
// atrapado y restaurado) vía useModalA11y. La cabecera y el pie son piezas
// opcionales para que los modales con cabecera propia reutilicen el marco.

export interface ModalProps {
  onClose: () => void
  /** id del título visible (aria-labelledby). */
  labelledBy: string
  describedBy?: string
  size?: ModalSize
  /** Elemento que recibe el foco al abrir (por defecto, el primero enfocable). */
  initialFocusRef?: RefObject<HTMLElement | null>
  /** Cerrar al pulsar fuera del panel. Desactívalo si hay datos sin guardar. */
  closeOnOverlay?: boolean
  className?: string
  children: ReactNode
}

export function Modal({
  onClose, labelledBy, describedBy, size = 'md', initialFocusRef, closeOnOverlay = true, className = '', children,
}: ModalProps) {
  const dialogRef = useModalA11y<HTMLDivElement>(onClose, initialFocusRef)

  // Bloquea el scroll del fondo mientras el modal está abierto y restaura el valor previo.
  useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previous }
  }, [])

  return createPortal(
    <div className={modalOverlayClasses()}
      onClick={closeOnOverlay ? e => { if (e.target === e.currentTarget) onClose() } : undefined}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={labelledBy} aria-describedby={describedBy}
        className={modalPanelClasses(size, className)}>
        {children}
      </div>
    </div>,
    document.body,
  )
}

export function ModalHeader({ titleId, title, icon, subtitle, onClose, className = '' }: {
  titleId: string
  title: ReactNode
  icon?: ReactNode
  subtitle?: ReactNode
  onClose?: () => void
  className?: string
}) {
  return (
    <div className={`flex items-start justify-between gap-3 px-5 py-4 border-b border-border shrink-0 ${className}`}>
      <div className="flex items-center gap-3 min-w-0">
        {icon}
        <div className="min-w-0">
          <h2 id={titleId} className="font-semibold text-base text-fg">{title}</h2>
          {subtitle && <p className="text-xs text-fg-subtle mt-0.5">{subtitle}</p>}
        </div>
      </div>
      {onClose && (
        <button type="button" onClick={onClose} aria-label="Cerrar" className={iconButtonClasses('sm', false, '-mr-1')}>
          <X size={16} />
        </button>
      )}
    </div>
  )
}

export function ModalBody({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`flex-1 overflow-y-auto p-5 ${className}`}>{children}</div>
}

export function ModalFooter({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`flex items-center justify-end gap-3 px-5 py-3 border-t border-border shrink-0 ${className}`}>{children}</div>
}
