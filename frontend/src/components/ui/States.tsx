import type { ReactNode } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import { Button } from './Button'
import { skeletonClasses, stateClasses } from './classes'

// Estados comunes (#199): vacío y error con la misma composición (icono,
// título, descripción, acción) en todas las pantallas. La carga sigue la norma
// de #494: esqueletos (SkeletonGroup) y barra de recarga (Loading.tsx).

interface StateProps {
  icon?: ReactNode
  title: ReactNode
  description?: ReactNode
  action?: ReactNode
  /** Menos aire vertical: para estados dentro de tarjetas o tablas. */
  compact?: boolean
  className?: string
}

export function EmptyState({ icon, title, description, action, compact = false, className = '' }: StateProps) {
  return (
    <div className={stateClasses(compact, className)}>
      {icon && <div className="text-fg-subtle mb-1" aria-hidden="true">{icon}</div>}
      <p className="text-sm text-fg-muted">{title}</p>
      {description && <p className="text-xs text-fg-subtle max-w-sm">{description}</p>}
      {action && <div className="mt-1">{action}</div>}
    </div>
  )
}

export function ErrorState({ title, description, onRetry, compact = false, className = '' }: Omit<StateProps, 'icon' | 'action'> & { onRetry?: () => void }) {
  return (
    <div role="alert" className={stateClasses(compact, className)}>
      <AlertTriangle size={28} className="text-negative mb-1" aria-hidden="true" />
      <p className="text-sm font-medium text-fg">{title}</p>
      {description && <p className="text-xs text-fg-subtle max-w-sm">{description}</p>}
      {onRetry && <Button size="sm" className="mt-2" icon={<RefreshCw size={12} />} onClick={onRetry}>Reintentar</Button>}
    </div>
  )
}

/** Marcador de carga con la forma del contenido final. */
export function Skeleton({ className = '' }: { className?: string }) {
  return <span aria-hidden="true" className={skeletonClasses(className)} />
}
