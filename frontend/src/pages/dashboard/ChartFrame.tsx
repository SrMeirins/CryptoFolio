import type { ReactNode } from 'react'
import { Skeleton, SkeletonGroup, NotApplicable, Button } from '../../components/ui'

// Estados comunes del área del gráfico de evolución (cargando, error, vacío).
export function ChartFrame({ loading, error, empty, errorText, onRetry, children }: {
  loading: boolean
  error: boolean
  empty: boolean
  errorText: string
  /** Reintentar la consulta (#498). */
  onRetry?: () => void
  children: ReactNode
}) {
  return (
    <div className="h-52 relative">
      {loading && (
        <SkeletonGroup label="Cargando el gráfico" className="absolute inset-0 flex flex-col justify-end gap-2 pb-6">
          <Skeleton className="h-full w-full rounded-xl opacity-60" />
          <Skeleton className="h-3 w-full" />
        </SkeletonGroup>
      )}
      {error && (
        <div role="alert" className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-xs text-fg-subtle">
          {errorText}
          {onRetry && <Button size="sm" onClick={onRetry}>Reintentar</Button>}
        </div>
      )}
      {!loading && !error && empty && (
        <NotApplicable className="absolute inset-0 flex items-center justify-center">Sin datos para este periodo.</NotApplicable>
      )}
      {!empty && children}
    </div>
  )
}
