import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { computePopoverPosition, type PopoverPosition } from './popoverPosition'

// Desplegable flotante base (#240): se pinta en <body> (no lo recorta ningún
// panel), se coloca junto a su botón y se abre hacia arriba si no cabe debajo.
// Se cierra con Escape o con un clic fuera y devuelve el foco al botón. Lo
// usan Dropdown, MonthPicker y DateRangePicker.

export interface PopoverProps {
  open: boolean
  onClose: () => void
  anchorRef: RefObject<HTMLElement | null>
  align?: 'start' | 'end'
  /** Ancho mínimo igual al del botón (listas de opciones). */
  matchWidth?: boolean
  className?: string
  children: ReactNode
  /** Atributos para el contenedor (role, id, aria-*). */
  ariaProps?: Record<string, string | undefined>
}

export function Popover({ open, onClose, anchorRef, align = 'start', matchWidth = false, className = '', children, ariaProps }: PopoverProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<PopoverPosition | null>(null)
  const [minWidth, setMinWidth] = useState<number | undefined>(undefined)
  const onCloseRef = useRef(onClose)
  useLayoutEffect(() => { onCloseRef.current = onClose })

  const place = useCallback(() => {
    const anchor = anchorRef.current?.getBoundingClientRect()
    const el = ref.current
    if (!anchor || !el) return
    setMinWidth(matchWidth ? anchor.width : undefined)
    setPosition(computePopoverPosition({
      anchor: { top: anchor.top, left: anchor.left, width: anchor.width, height: anchor.height },
      size: { width: Math.max(el.scrollWidth, matchWidth ? anchor.width : 0), height: el.scrollHeight },
      viewport: { width: window.innerWidth, height: window.innerHeight },
      align,
    }))
  }, [anchorRef, align, matchWidth])

  // Se coloca antes del primer pintado al abrir (cerrado no se pinta).
  useLayoutEffect(() => {
    if (open) place()
  }, [open, place])

  useEffect(() => {
    if (!open) return
    const anchor = anchorRef.current
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      onCloseRef.current()
      anchor?.focus()
    }
    const onPointer = (e: PointerEvent) => {
      const t = e.target as Node
      if (!ref.current?.contains(t) && !anchor?.contains(t)) onCloseRef.current()
    }
    // Captura: el Escape del desplegable no debe cerrar también un modal que lo contenga.
    document.addEventListener('keydown', onKey, true)
    document.addEventListener('pointerdown', onPointer)
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      document.removeEventListener('keydown', onKey, true)
      document.removeEventListener('pointerdown', onPointer)
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [open, place, anchorRef])

  if (!open) return null
  return createPortal(
    <div
      ref={ref}
      {...ariaProps}
      className={`fixed z-[60] bg-background-card border border-border rounded-xl shadow-2xl overflow-auto animate-date-picker-in ${className}`}
      style={{
        top: position?.top ?? 0,
        left: position?.left ?? 0,
        minWidth,
        maxHeight: position ? position.maxHeight : undefined,
        visibility: position ? 'visible' : 'hidden',
      }}
    >
      {children}
    </div>,
    document.body,
  )
}
