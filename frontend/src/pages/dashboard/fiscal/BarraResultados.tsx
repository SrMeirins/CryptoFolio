import { Link } from 'react-router-dom'
import { TrendingDown, TrendingUp } from 'lucide-react'
import { formatEur } from '../../../utils/format'
import { gainLossShares } from '../../../utils/fiscalPanel'

// Ganancias frente a pérdidas del ejercicio (#515): barra proporcional y, bajo
// ella, cada parte con su importe y su número de operaciones; cada una abre
// Operaciones de Fiscal filtrada por ese resultado.

export function BarraResultados({ gains, losses, recuento, enlaces }: {
  gains: number
  losses: number
  /** Operaciones con ganancia y con pérdida; null mientras cargan. */
  recuento: { ganancias: number; perdidas: number } | null
  enlaces: { ganancias: string; perdidas: string }
}) {
  const shares = gainLossShares(gains, losses)
  const ops = (n: number | undefined) => (n === undefined ? '' : ` en ${n} ${n === 1 ? 'operación' : 'operaciones'}`)
  // Con 0 € no se pinta signo: nunca «−0,00 €» ni «+0,00 €».
  const mas = (n: number) => `${n > 0.005 ? '+' : ''}${formatEur(Math.abs(n))}`
  const menos = (n: number) => `${Math.abs(n) > 0.005 ? '\u2212' : ''}${formatEur(Math.abs(n))}`
  const enlace = 'inline-flex items-center gap-1 rounded-md px-1 -mx-1 hover:bg-overlay/5 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand'
  return (
    <div>
      <div aria-hidden="true" className="flex h-2.5 rounded-full overflow-hidden bg-overlay/6 gap-px">
        <Link to={enlaces.ganancias} tabIndex={-1} className="h-full bg-positive transition-[width] duration-700 hover:brightness-110" style={{ width: `${shares.gains}%` }} />
        <Link to={enlaces.perdidas} tabIndex={-1} className="h-full bg-negative transition-[width] duration-700 hover:brightness-110" style={{ width: `${shares.losses}%` }} />
      </div>
      <div className="flex justify-between gap-3 mt-1.5 text-xs flex-wrap">
        <Link to={enlaces.ganancias} className={`${enlace} text-positive-ink`}
          aria-label={`Ganancias: ${mas(gains)}${ops(recuento?.ganancias)}. Ver las operaciones con ganancia en Fiscal`}>
          <TrendingUp size={13} aria-hidden="true" />
          <span className="mono font-semibold">{mas(gains)}</span>
          {recuento && <span className="text-fg-muted">{ops(recuento.ganancias).trim()}</span>}
        </Link>
        <Link to={enlaces.perdidas} className={`${enlace} text-negative-ink`}
          aria-label={`Pérdidas: ${menos(losses)}${ops(recuento?.perdidas)}. Ver las operaciones con pérdida en Fiscal`}>
          <TrendingDown size={13} aria-hidden="true" />
          <span className="mono font-semibold">{menos(losses)}</span>
          {recuento && <span className="text-fg-muted">{ops(recuento.perdidas).trim()}</span>}
        </Link>
      </div>
    </div>
  )
}
