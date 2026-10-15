import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'

// Cabecera común de las páginas (#232): icono de la sección en una pastilla
// con el color de marca, título y subtítulo con contexto; acciones a la derecha.
export function PageHeader({ icon: Icon, title, subtitle, badges, actions }: {
  icon: LucideIcon
  title: string
  subtitle?: ReactNode
  /** Elementos junto al título (p. ej. la insignia «solo EUR»). */
  badges?: ReactNode
  actions?: ReactNode
}) {
  return (
    <header className="flex items-center justify-between gap-4 flex-wrap">
      <div className="flex items-center gap-3.5 min-w-0">
        <span aria-hidden="true"
          className="w-11 h-11 shrink-0 rounded-xl flex items-center justify-center text-brand bg-linear-to-br from-brand/20 to-brand/5 ring-1 ring-brand/25 shadow-sm">
          <Icon size={20} strokeWidth={2.2} />
        </span>
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-semibold tracking-tight text-fg leading-tight">{title}</h1>
            {badges}
          </div>
          {subtitle && <p className="text-sm text-fg-subtle mt-0.5 truncate">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}
    </header>
  )
}
