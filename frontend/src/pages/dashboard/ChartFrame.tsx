import type { ReactNode } from 'react'
import { Skeleton } from '../../components/ui'

// Estados comunes del área del gráfico de evolución (cargando, error, vacío).
export function ChartFrame({ loading, error, empty, errorText, children }: {
  loading: boolean
  error: boolean
  empty: boolean
  errorText: string
  children: ReactNode
}) {
  return (
    <div className="h-52 relative">
      {loading && (
        <div role="status" aria-label="Cargando el gráfico" className="absolute inset-0 flex flex-col justify-end gap-2 pb-6">
          <Skeleton className="h-full w-full rounded-xl opacity-60" />
          <Skeleton className="h-3 w-full" />
        </div>
      )}
      {error && <div className="absolute inset-0 flex items-center justify-center text-xs text-fg-subtle">{errorText}</div>}
      {!loading && !error && empty && (
        <div className="absolute inset-0 flex items-center justify-center text-xs text-fg-subtle">Sin datos para este periodo</div>
      )}
      {!empty && children}
    </div>
  )
}
