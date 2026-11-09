import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { StatStrip, type StatStripCell } from './StatStrip'

// Cabecera de vista (#535, variante A elegida): tarjeta con icono en degradado,
// etiqueta superior con su estado, título grande, subtítulo, acciones a la
// derecha y una tira con las cifras propias de la vista. Debajo, un pie
// opcional (p. ej. un enlace relacionado). Un h2: la página lleva el h1.
export function ViewHeader({ id, icon: Icon, eyebrow, badge, title, subtitle, actions, stats, footer }: {
  id: string
  icon: LucideIcon
  eyebrow: ReactNode
  /** Pastilla junto a la etiqueta (p. ej. el estado del ejercicio). */
  badge?: ReactNode
  title: string
  subtitle?: ReactNode
  actions?: ReactNode
  /** Cifras de la vista (2 a 6). */
  stats?: readonly StatStripCell[]
  footer?: ReactNode
}) {
  return (
    <section aria-labelledby={id} className="view-header rounded-2xl border border-border p-5 sm:p-6">
      <div className="flex items-start gap-4 flex-wrap">
        <span aria-hidden="true" className="view-header-tile grid place-items-center size-12 rounded-2xl text-on-brand shrink-0">
          <Icon size={22} />
        </span>
        <div className="min-w-0 flex-1 basis-64">
          <p className="flex items-center gap-2 flex-wrap text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-ink">
            {eyebrow}
            {badge && <span className="normal-case tracking-normal">{badge}</span>}
          </p>
          <h2 id={id} className="mt-1 text-[26px] leading-tight font-semibold tracking-tight text-fg">{title}</h2>
          {subtitle && <p className="mt-1 text-sm text-fg-muted max-w-[70ch]">{subtitle}</p>}
        </div>
        {actions && <div className="flex items-center gap-2 flex-wrap max-w-full min-w-0 sm:ml-auto">{actions}</div>}
      </div>
      {stats && stats.length > 0 && <StatStrip label={`Cifras: ${title}`} cells={stats} className="mt-5" />}
      {footer && <div className="mt-3 text-xs">{footer}</div>}
    </section>
  )
}
