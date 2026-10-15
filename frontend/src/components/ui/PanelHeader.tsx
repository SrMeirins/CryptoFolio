import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { Tooltip } from './Tooltip'

// Cabecera común de los paneles (#232): icono pequeño con el color de marca,
// etiqueta en mayúsculas espaciadas, ayuda «?» opcional, subtítulo con
// contexto dinámico y acciones a la derecha.
export function PanelHeader({ icon: Icon, title, help, subtitle, extra, actions, className = '' }: {
  icon: LucideIcon
  title: string
  help?: ReactNode
  subtitle?: ReactNode
  /** Elementos junto a la etiqueta (p. ej. pestañas o una insignia). */
  extra?: ReactNode
  actions?: ReactNode
  className?: string
}) {
  return (
    <div className={`flex items-start justify-between gap-3 flex-wrap ${className}`}>
      <div className="min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span aria-hidden="true" className="w-6 h-6 shrink-0 rounded-md flex items-center justify-center text-brand bg-brand/10">
            <Icon size={13} strokeWidth={2.3} />
          </span>
          <h2 className="text-[11px] text-fg-muted font-semibold uppercase tracking-widest">{title}</h2>
          {help && <Tooltip label={title}>{help}</Tooltip>}
          {extra}
        </div>
        {subtitle && <p className="text-xs text-fg-subtle mt-1 ml-8">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}
    </div>
  )
}
