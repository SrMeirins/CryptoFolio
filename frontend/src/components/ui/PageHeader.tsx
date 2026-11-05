import { useRef, useState, type ReactNode } from 'react'
import { MoreHorizontal, type LucideIcon } from 'lucide-react'
import { NARROW_QUERY, useMediaQuery } from '../../hooks/useMediaQuery'
import { Popover } from './Popover'
import { iconButtonClasses } from './classes'

// Cabeceras comunes (#232, #491). Mismos huecos y mismo orden en las páginas
// (PageHeader, un h1 por página) y en sus pestañas o secciones (SectionHeader,
// un h2 por pestaña): etiqueta superior opcional, título con pastillas,
// subtítulo con contexto vivo y acciones a la derecha. Las acciones
// secundarias pasan a un menú «Más» en pantallas estrechas, sin cortarse.

interface HeaderSlots {
  title: string
  /** Etiqueta superior (sección o ejercicio). */
  eyebrow?: ReactNode
  /** Contexto vivo bajo el título (p. ej. «13 activos · 4 wallets»). */
  subtitle?: ReactNode
  /** Pastillas de estado junto al título. */
  badges?: ReactNode
  /** Acción principal: siempre visible. */
  actions?: ReactNode
  /** Acciones secundarias (exportar, opciones): en estrecho, dentro de «Más». */
  secondaryActions?: ReactNode
}

function Actions({ actions, secondaryActions, label }: Pick<HeaderSlots, 'actions' | 'secondaryActions'> & { label: string }) {
  const narrow = useMediaQuery(NARROW_QUERY)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLButtonElement>(null)
  if (!actions && !secondaryActions) return null
  return (
    <div className="flex items-center gap-2 flex-wrap max-w-full min-w-0">
      {secondaryActions && (narrow ? (
        <>
          <button ref={ref} type="button" onClick={() => setOpen(o => !o)} aria-haspopup="dialog" aria-expanded={open}
            aria-label={`Más acciones de ${label}`} className={iconButtonClasses('md')}>
            <MoreHorizontal size={16} aria-hidden="true" />
          </button>
          <Popover open={open} onClose={() => setOpen(false)} anchorRef={ref} align="end"
            className="p-2 flex flex-col items-stretch gap-1.5" ariaProps={{ role: 'dialog', 'aria-label': `Más acciones de ${label}` }}>
            {secondaryActions}
          </Popover>
        </>
      ) : secondaryActions)}
      {actions}
    </div>
  )
}

export function PageHeader({ icon: Icon, title, eyebrow, subtitle, badges, actions, secondaryActions }: HeaderSlots & { icon: LucideIcon }) {
  return (
    <header className="flex items-center justify-between gap-4 flex-wrap">
      <div className="flex items-center gap-3.5 min-w-0">
        <span aria-hidden="true"
          className="w-11 h-11 shrink-0 rounded-xl flex items-center justify-center text-brand bg-linear-to-br from-brand/20 to-brand/5 ring-1 ring-brand/25 shadow-sm">
          <Icon size={20} strokeWidth={2.2} />
        </span>
        <div className="min-w-0">
          {eyebrow && <p className="text-[11px] uppercase tracking-widest text-fg-subtle">{eyebrow}</p>}
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-semibold tracking-tight text-fg leading-tight">{title}</h1>
            {badges}
          </div>
          {subtitle && <p className="text-sm text-fg-subtle mt-0.5">{subtitle}</p>}
        </div>
      </div>
      <Actions actions={actions} secondaryActions={secondaryActions} label={title} />
    </header>
  )
}

/** Cabecera de una pestaña o sección dentro de una página: mismo orden, un h2. */
export function SectionHeader({ id, title, eyebrow, subtitle, badges, actions, secondaryActions, className = '' }: HeaderSlots & {
  /** Id del h2, para enlazarlo con aria-labelledby. */
  id?: string
  className?: string
}) {
  return (
    <header className={`flex items-start justify-between gap-3 flex-wrap ${className}`}>
      <div className="min-w-0">
        {eyebrow && <p className="text-[10.5px] uppercase tracking-widest text-fg-subtle">{eyebrow}</p>}
        <div className="flex items-center gap-2 flex-wrap">
          <h2 id={id} className="text-base font-semibold text-fg leading-tight">{title}</h2>
          {badges}
        </div>
        {subtitle && <p className="text-xs text-fg-subtle mt-0.5">{subtitle}</p>}
      </div>
      <Actions actions={actions} secondaryActions={secondaryActions} label={title} />
    </header>
  )
}
