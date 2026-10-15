import { Calendar } from 'lucide-react'
import { formatEur, pnlColor } from '../../utils/format'
import { pnlBg } from './constants'
import type { FiscalSummary } from './types'
import { cardClasses, Skeleton } from '../../components/ui'

export function FiscalSummaryCardsSkeleton() {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {[...Array(4)].map((_, i) => (
        <div key={i} className={cardClasses('md')}>
          <Skeleton className="h-3 w-3/4 mb-3" />
          <Skeleton className="h-7 w-1/2" />
        </div>
      ))}
    </div>
  )
}

export function FiscalSummaryCards({ summary }: { summary: FiscalSummary }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <div className={`bg-background-card border rounded-xl p-5 ${pnlBg(summary.totalGanancias)}`}>
        <div className="text-[11px] text-fg-subtle uppercase tracking-widest mb-2">Ganancias</div>
        <div className="text-xl font-bold mono text-positive">+{formatEur(summary.totalGanancias)}</div>
        <div className="text-xs text-fg-subtle mt-1.5">Base del ahorro IRPF</div>
      </div>

      <div className={`bg-background-card border rounded-xl p-5 ${pnlBg(summary.totalPerdidas)}`}>
        <div className="text-[11px] text-fg-subtle uppercase tracking-widest mb-2">Pérdidas</div>
        <div className="text-xl font-bold mono text-negative">{formatEur(summary.totalPerdidas)}</div>
        <div className="text-xs text-fg-subtle mt-1.5">Compensables 4 años</div>
      </div>

      <div className={`bg-background-card border rounded-xl p-5 ${pnlBg(summary.netoPatrimonial)}`}>
        <div className="text-[11px] text-fg-subtle uppercase tracking-widest mb-2">Neto a declarar</div>
        <div className={`text-xl font-bold mono ${pnlColor(summary.netoPatrimonial)}`}>
          {summary.netoPatrimonial >= 0 ? '+' : ''}{formatEur(summary.netoPatrimonial)}
        </div>
        <div className="text-xs text-fg-subtle mt-1.5">{summary.numOperacionesPatrimoniales} operaciones</div>
        {summary.esAnioEnCurso && (
          <div className="text-xs text-info mt-1 flex items-center gap-1">
            <Calendar size={9} />
            Año en curso · hasta hoy
          </div>
        )}
      </div>

      <div className={cardClasses('md')}>
        <div className="text-[11px] text-fg-subtle uppercase tracking-widest mb-2">Rendimientos</div>
        <div className="text-xl font-bold mono text-warning">{formatEur(summary.totalRendimientos)}</div>
        <div className="text-xs text-fg-subtle mt-1.5">{summary.numRendimientos} operaciones</div>
      </div>
    </div>
  )
}
