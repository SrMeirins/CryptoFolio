import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { panelEnterStyle, panelSurface } from '../../components/ui'

/**
 * Bloque común de Ajustes (#445): superficie ligera de los paneles, cabecera
 * con icono, título y descripción, acción opcional a la derecha y entrada
 * escalonada según su posición (`index`). `status` muestra junto al título la
 * marca de guardado del ajuste.
 */
export function SettingsCard({ title, description, icon: Icon, action, status, index = 0, tone, children }: {
  title: string
  description?: ReactNode
  icon?: LucideIcon
  action?: ReactNode
  status?: ReactNode
  /** Orden del bloque en la sección, para la entrada en cascada. */
  index?: number
  /** Bloques de peligro: borde y brillo en rojo. */
  tone?: 'danger'
  children?: ReactNode
}) {
  return (
    <section aria-label={title} style={{ ...panelEnterStyle(index), ...(tone === 'danger' && { '--panel': 'var(--cf-negative)' }) } as React.CSSProperties}
      className={panelSurface('md', `panel-in space-y-4 ${tone === 'danger' ? 'border-negative/30' : ''}`)}>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          {Icon && (
            <span aria-hidden="true" className={`w-8 h-8 rounded-lg grid place-items-center shrink-0 ${tone === 'danger' ? 'bg-negative/10 text-negative-ink' : 'bg-brand/10 text-brand-ink'}`}>
              <Icon size={15} />
            </span>
          )}
          <div className="min-w-0">
            <h3 className={`font-semibold text-sm flex items-center gap-2 flex-wrap ${tone === 'danger' ? 'text-negative-ink' : ''}`}>{title}{status}</h3>
            {description && <p className="text-xs text-fg-subtle mt-0.5 leading-relaxed">{description}</p>}
          </div>
        </div>
        {action}
      </div>
      {children}
    </section>
  )
}
