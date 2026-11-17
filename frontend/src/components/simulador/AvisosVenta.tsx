import { Link } from 'react-router-dom'
import { AlertTriangle, CalendarDays } from 'lucide-react'
import type { SimulationResult } from '../../api/portfolio'
import { formatEur } from '../../utils/format'
import { formatLotDate } from '../../utils/portfolioLots'
import { recompraHasta } from '../../utils/simuladorResumen'

// Avisos del simulador (#529), con fechas legibles y enlaces:
// - Regla de recompra (art. 33.5 LIRPF): compras de los dos meses anteriores y
//   la fecha hasta la que una recompra impediría computar la pérdida.
// - Ejercicio: en qué IRPF cuenta la venta, lo ya realizado en él y, con
//   pérdida sin ganancias que compensar, cuántos años queda pendiente.

export function AvisosVenta({ result, hoy = new Date(), onNavegar }: {
  result: SimulationResult
  hoy?: Date
  /** Se llama antes de seguir un enlace (cierra el simulador). */
  onNavegar?: () => void
}) {
  const perdida = result.netGainLoss < -0.005
  const year = result.irpf.year
  return (
    <div className="space-y-2">
      {result.recompra.aviso && (
        <div role="status" className="flex items-start gap-2.5 px-3.5 py-3 rounded-xl border border-warning/30 bg-warning/5">
          <AlertTriangle size={14} className="text-warning shrink-0 mt-0.5" aria-hidden="true" />
          <div className="text-xs text-fg-muted leading-relaxed space-y-1">
            <p className="font-semibold text-fg">Regla de recompra</p>
            <p>
              Compraste {result.asset} el {result.recompra.comprasRecientes.map(formatLotDate).join(', ')}, dentro de los dos meses anteriores.
              Esta pérdida no computará hasta que vendas esos lotes, y tampoco si vuelves a comprar {result.asset} antes del{' '}
              <strong className="text-fg">{formatLotDate(recompraHasta(hoy).toISOString())}</strong>.
            </p>
            <Link to={`/history?buscar=${encodeURIComponent(result.asset)}`} onClick={onNavegar}
              className="inline-block text-brand-ink underline underline-offset-2 hover:no-underline rounded focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-brand">
              Ver las compras de {result.asset} en Historial
            </Link>
          </div>
        </div>
      )}
      <div className="flex items-start gap-2.5 px-3.5 py-3 rounded-xl border border-border bg-overlay/2">
        <CalendarDays size={14} className="text-fg-subtle shrink-0 mt-0.5" aria-hidden="true" />
        <div className="text-xs text-fg-muted leading-relaxed space-y-1">
          <p>
            Cuenta en el IRPF de <strong className="text-fg">{year}</strong>, que se declara en {year + 1}.
            Tu base del ahorro de {year} antes de esta venta es de <span className="mono text-fg">{formatEur(result.irpf.baseAntes)}</span>.
          </p>
          {perdida && result.irpf.marginal > -0.005 && (
            <p>No hay ganancias en {year} que compensar: la pérdida queda pendiente para los 4 ejercicios siguientes.</p>
          )}
          <Link to="/fiscal?vista=planificar" onClick={onNavegar}
            className="inline-block text-brand-ink underline underline-offset-2 hover:no-underline rounded focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-brand">
            Planificar el ejercicio {year} en Fiscal
          </Link>
        </div>
      </div>
    </div>
  )
}
