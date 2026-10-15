import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { computeTooltipPosition, type Placement, type TooltipPosition } from './tooltipPosition'

// Tooltip común (#199 / #211). Se pinta en un portal con posición fija, así
// que ningún contenedor con overflow lo recorta, y se recoloca para no salirse
// nunca de la ventana. Se abre con el ratón, con el foco del teclado o al
// tocar; se cierra con Escape, al tocar fuera o al perder el foco.

export interface TooltipProps {
  /** Título del tooltip y nombre accesible del disparador por defecto. */
  label: string
  children: ReactNode
  /** Lado preferido; si no cabe, se abre hacia el otro. */
  direction?: Placement
  /** Contenido visible del disparador en lugar del «?» (p. ej. el chip de 24h). */
  trigger?: ReactNode
  /** Nombre accesible del disparador; por defecto, `label`. */
  triggerLabel?: string
  /** Acción del disparador al pulsarlo (p. ej. refrescar); sustituye a fijar el tooltip. */
  onActivate?: () => void
  /** Clases del botón disparador cuando se usa `trigger`. */
  triggerClassName?: string
}

export function Tooltip({ label, children, direction = 'down', trigger, triggerLabel, onActivate, triggerClassName }: TooltipProps) {
  const [hovered, setHovered] = useState(false)
  const [pinned, setPinned] = useState(false)
  const [position, setPosition] = useState<TooltipPosition | null>(null)
  const anchorRef = useRef<HTMLButtonElement>(null)
  const tipRef = useRef<HTMLDivElement>(null)
  const tooltipId = useId()
  const open = hovered || pinned

  const place = useCallback(() => {
    const anchor = anchorRef.current?.getBoundingClientRect()
    const tip = tipRef.current?.getBoundingClientRect()
    if (!anchor || !tip) return
    setPosition(computeTooltipPosition({
      anchor: { top: anchor.top, left: anchor.left, width: anchor.width, height: anchor.height },
      size: { width: tip.width, height: tip.height },
      viewport: { width: window.innerWidth, height: window.innerHeight },
      preferred: direction,
    }))
  }, [direction])

  // Se mide antes de pintar para no mostrar el tooltip en una posición errónea.
  useLayoutEffect(() => {
    if (open) place()
  }, [open, place])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setPinned(false); setHovered(false) } }
    const onPointer = (e: PointerEvent) => {
      if (!anchorRef.current?.contains(e.target as Node) && !tipRef.current?.contains(e.target as Node)) setPinned(false)
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('pointerdown', onPointer)
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('pointerdown', onPointer)
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [open, place])

  const triggerProps = {
    ref: anchorRef,
    type: 'button' as const,
    'aria-label': triggerLabel ?? label,
    'aria-describedby': open ? tooltipId : undefined,
    'aria-expanded': pinned,
    onMouseEnter: () => setHovered(true),
    onMouseLeave: () => setHovered(false),
    onFocus: () => setHovered(true),
    onBlur: () => { setHovered(false); setPinned(false) },
    onClick: onActivate ?? (() => setPinned(p => !p)),
  }

  return (
    <span className="relative inline-flex items-center">
      {trigger ? (
        <button {...triggerProps} className={triggerClassName ?? 'cursor-default rounded-lg focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand/60'}>
          {trigger}
        </button>
      ) : (
        <button {...triggerProps}
          className={`w-3.5 h-3.5 rounded-full flex items-center justify-center text-[11px] font-semibold cursor-default select-none transition-all duration-150 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand/60 ${
            open ? 'bg-brand/20 text-brand border border-brand/50' : 'bg-overlay/5 text-fg-subtle border border-overlay/10 hover:border-overlay/20 hover:text-fg-muted'
          }`}>
          ?
        </button>
      )}

      {open && createPortal(
        <div ref={tipRef} id={tooltipId} role="tooltip"
          className="fixed z-100 w-64 max-w-[calc(100vw-16px)] pointer-events-none"
          style={{ top: position?.top ?? 0, left: position?.left ?? 0, visibility: position ? 'visible' : 'hidden' }}>
          {position?.placement === 'down' && <Arrow left={position.arrowLeft} side="down" />}
          <div className="relative rounded-xl border border-overlay/10 bg-tooltip/95 backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.35)] p-4 animate-slide-in">
            <div className="absolute inset-x-0 top-0 h-px rounded-t-xl bg-linear-to-r from-transparent via-brand/40 to-transparent" />
            <p className="text-[11px] font-semibold tracking-widest text-brand uppercase mb-2">{label}</p>
            <div className="text-xs text-fg leading-relaxed space-y-2">{children}</div>
          </div>
          {position?.placement === 'up' && <Arrow left={position.arrowLeft} side="up" />}
        </div>,
        document.body,
      )}
    </span>
  )
}

function Arrow({ left, side }: { left: number; side: Placement }) {
  return (
    <div className={side === 'down' ? '-mb-px' : '-mt-px'} style={{ paddingLeft: left - 5 }}>
      <div className={`w-2.5 h-2.5 rotate-45 bg-tooltip/95 border-overlay/10 ${side === 'down' ? 'border-l border-t' : 'border-r border-b'}`} />
    </div>
  )
}
