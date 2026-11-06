import { cloneElement, type MouseEvent, type ReactElement, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import type { Placement, TooltipPosition } from './tooltipPosition'
import { useTooltipCore } from './useTooltipCore'

// Tooltip común (#199 / #211). Se pinta en un portal con posición fija, así
// que ningún contenedor con overflow lo recorta, y se recoloca para no salirse
// nunca de la ventana. Se abre con el ratón, con el foco del teclado o al
// tocar; se cierra con Escape, al tocar fuera o al perder el foco. Hint es su
// variante para un botón o enlace que ya existe (#495).

export interface TooltipProps {
  /** Título del tooltip y nombre accesible del disparador por defecto. */
  label: string
  children: ReactNode
  /** Lado preferido; si no cabe, se abre hacia el otro. */
  direction?: Placement
  /** Contenido visible del disparador en lugar del «?» (p. ej. el chip de 24h). */
  trigger?: ReactNode
  /**
   * Nombre accesible del disparador; por defecto, `label`. Con `null` el nombre
   * es el contenido visible del disparador (p. ej. una fecha o una cifra, #495).
   */
  triggerLabel?: string | null
  /** Acción del disparador al pulsarlo (p. ej. refrescar); sustituye a fijar el tooltip. */
  onActivate?: () => void
  /** Clases del botón disparador cuando se usa `trigger`. */
  triggerClassName?: string
  /** Clases del envoltorio (p. ej. `w-full` para un disparador de ancho completo). */
  className?: string
  /** tabIndex del disparador: -1 en filas que no son la activa de una tabla con tabulación itinerante. */
  triggerTabIndex?: number
}

export function Tooltip({ label, children, direction = 'down', trigger, triggerLabel, onActivate, triggerClassName, className = '', triggerTabIndex }: TooltipProps) {
  const { open, pinned, setHovered, setPinned, position, anchorRef, tipRef, tooltipId } = useTooltipCore(direction)

  const triggerProps = {
    ref: anchorRef as RefObject<HTMLButtonElement>,
    type: 'button' as const,
    'aria-label': triggerLabel === null ? undefined : triggerLabel ?? label,
    'aria-describedby': open ? tooltipId : undefined,
    'aria-expanded': pinned,
    tabIndex: triggerTabIndex,
    onMouseEnter: () => setHovered(true),
    onMouseLeave: () => setHovered(false),
    onFocus: () => setHovered(true),
    onBlur: () => { setHovered(false); setPinned(false) },
    onClick: onActivate ?? ((e: MouseEvent) => { e.stopPropagation(); setPinned(p => !p) }),
  }

  return (
    <span className={`relative inline-flex items-center ${className}`}>
      {trigger ? (
        <button {...triggerProps} className={triggerClassName ?? 'cursor-default rounded-lg focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand/60'}>
          {trigger}
        </button>
      ) : (
        <button {...triggerProps}
          className={`w-3.5 h-3.5 rounded-full flex items-center justify-center text-[11px] font-semibold cursor-default select-none transition-all duration-150 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand/60 ${
            open ? 'bg-brand/20 text-brand-ink border border-brand/50' : 'bg-overlay/5 text-fg-subtle border border-overlay/10 hover:border-overlay/20 hover:text-fg-muted'
          }`}>
          ?
        </button>
      )}

      {open && <Bubble tipRef={tipRef} id={tooltipId} position={position} label={label}>{children}</Bubble>}
    </span>
  )
}

/** Globo del tooltip en un portal; sin `label`, una sola línea sin encabezado (Hint). */
function Bubble({ tipRef, id, position, label, children }: {
  tipRef: RefObject<HTMLDivElement>
  id: string
  position: TooltipPosition | null
  label?: string
  children: ReactNode
}) {
  return createPortal(
    <div ref={tipRef} id={id} role="tooltip"
      className={`fixed z-100 ${label ? 'w-64' : 'w-max max-w-64'} max-w-[calc(100vw-16px)] pointer-events-none`}
      style={{ top: position?.top ?? 0, left: position?.left ?? 0, visibility: position ? 'visible' : 'hidden' }}>
      {position?.placement === 'down' && <Arrow left={position.arrowLeft} side="down" />}
      <div className={`relative rounded-xl border border-overlay/10 bg-tooltip/95 backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.35)] animate-slide-in ${label ? 'p-4' : 'px-3 py-2'}`}>
        <div className="absolute inset-x-0 top-0 h-px rounded-t-xl bg-linear-to-r from-transparent via-brand/40 to-transparent" />
        {label && <p className="text-[11px] font-semibold tracking-widest text-brand uppercase mb-2">{label}</p>}
        <div className="text-xs text-fg leading-relaxed space-y-2">{children}</div>
      </div>
      {position?.placement === 'up' && <Arrow left={position.arrowLeft} side="up" />}
    </div>,
    document.body,
  )
}

/**
 * Dato o texto con explicación (#495): el propio contenido abre el Tooltip, con
 * su texto como nombre accesible. Sin `tip` se muestra solo el contenido.
 */
export function TextTooltip({ label, tip, children, tabIndex, className = '' }: {
  /** Encabezado del globo. */
  label: string
  /** Explicación; si está vacía, no hay globo. */
  tip: ReactNode
  children: ReactNode
  /** Para filas con tabulación itinerante. */
  tabIndex?: number
  /** Clases extra del disparador (p. ej. su disposición interna). */
  className?: string
}) {
  if (!tip) return <>{children}</>
  // Un botón centra el texto: el disparador hereda la alineación de la celda.
  return (
    <Tooltip label={label} triggerLabel={null} triggerTabIndex={tabIndex} trigger={<>{children}</>}
      triggerClassName={`cursor-help rounded [text-align:inherit] focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand/60 ${className}`}>
      <p>{tip}</p>
    </Tooltip>
  )
}

/**
 * Globo sobre un elemento interactivo que ya existe (#495): un botón de icono,
 * un enlace o un campo. Se abre al pasar el ratón o al enfocarlo y se cierra
 * con Escape; no añade paradas de tabulador. Si el texto no coincide con el
 * nombre accesible del elemento, se enlaza con aria-describedby.
 */
export function Hint({ label, children, direction = 'up', className = '' }: {
  label: string
  children: ReactElement<{ 'aria-label'?: string; 'aria-describedby'?: string }>
  direction?: Placement
  className?: string
}) {
  const { open, setHovered, position, anchorRef, tipRef, tooltipId } = useTooltipCore(direction)
  const describe = open && children.props['aria-label'] !== label
  return (
    <span ref={anchorRef as RefObject<HTMLSpanElement>} className={`inline-flex ${className}`}
      onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      onFocus={() => setHovered(true)} onBlur={() => setHovered(false)}>
      {describe ? cloneElement(children, { 'aria-describedby': tooltipId }) : children}
      {open && <Bubble tipRef={tipRef} id={tooltipId} position={position}>{label}</Bubble>}
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
