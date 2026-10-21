import { RefreshCw } from 'lucide-react'
import type { PreparacionHistoricos } from '../api/portfolio'
import { porcentajePreparacion } from '../utils/preparacion'

// Carga mientras se descargan los precios de cierre históricos (#334): en lugar
// de cifras provisionales, el progreso real por activos.
export function PreparandoHistoricos({ datos, compacto = false }: { datos: PreparacionHistoricos | undefined; compacto?: boolean }) {
  const { listos = 0, total = 0 } = datos?.progreso ?? {}
  const pct = porcentajePreparacion(datos?.progreso)
  if (compacto) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-fg-subtle" role="status">
        <RefreshCw size={11} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />
        Calculando…
      </span>
    )
  }
  return (
    <div role="status" className="flex flex-col items-center justify-center gap-3 py-10 text-center">
      <RefreshCw size={22} className="text-brand animate-spin motion-reduce:animate-none" aria-hidden="true" />
      <div className="space-y-1">
        <p className="text-sm font-medium text-fg">Preparando tus datos históricos</p>
        <p className="text-xs text-fg-subtle">
          Descargando el precio de cierre de cada día{total > 0 ? ` · ${listos} de ${total} activos` : ''}. Las cifras aparecerán cuando esté todo listo.
        </p>
      </div>
      <div className="w-56 h-1.5 rounded-full bg-background-tertiary overflow-hidden" role="progressbar" aria-label="Precios de cierre descargados"
        aria-valuemin={0} aria-valuemax={total} aria-valuenow={listos}>
        <div className="h-full rounded-full bg-brand-solid transition-all duration-500 motion-reduce:transition-none" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}
