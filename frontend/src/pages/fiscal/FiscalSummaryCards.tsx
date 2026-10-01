import { Calendar } from 'lucide-react'
import { formatEur, pnlColor } from '../../utils/format'
import { pnlBg } from './helpers'
import type { FiscalSummary } from './types'

export function FiscalSummaryCardsSkeleton() {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {[...Array(4)].map((_, i) => (
        <div key={i} className="bg-background-card border border-border rounded-2xl p-5 animate-pulse">
          <div className="h-3 bg-background-tertiary rounded w-3/4 mb-3" />
          <div className="h-7 bg-background-tertiary rounded w-1/2" />
        </div>
      ))}
    </div>
  )
}

export function FiscalSummaryCards({ summary }: { summary: FiscalSummary }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <div className={`bg-background-card border rounded-2xl p-5 ${pnlBg(summary.totalGanancias)}`}>
        <div className="text-[11px] text-gray-500 uppercase tracking-widest mb-2">Ganancias</div>
        <div className="text-xl font-bold mono text-accent-green">+{formatEur(summary.totalGanancias)}</div>
        <div className="text-[10px] text-gray-600 mt-1.5">Base del ahorro IRPF</div>
      </div>

      <div className={`bg-background-card border rounded-2xl p-5 ${pnlBg(summary.totalPerdidas)}`}>
        <div className="text-[11px] text-gray-500 uppercase tracking-widest mb-2">Pérdidas</div>
        <div className="text-xl font-bold mono text-accent-red">{formatEur(summary.totalPerdidas)}</div>
        <div className="text-[10px] text-gray-600 mt-1.5">Compensables 4 años</div>
      </div>

      <div className={`bg-background-card border rounded-2xl p-5 ${pnlBg(summary.netoPatrimonial)}`}>
        <div className="text-[11px] text-gray-500 uppercase tracking-widest mb-2">Neto a declarar</div>
        <div className={`text-xl font-bold mono ${pnlColor(summary.netoPatrimonial)}`}>
          {summary.netoPatrimonial >= 0 ? '+' : ''}{formatEur(summary.netoPatrimonial)}
        </div>
        <div className="text-[10px] text-gray-600 mt-1.5">{summary.numOperacionesPatrimoniales} operaciones</div>
        {summary.esAnioEnCurso && (
          <div className="text-[10px] text-accent-blue mt-1 flex items-center gap-1">
            <Calendar size={9} />
            Año en curso · hasta hoy
          </div>
        )}
      </div>

      <div className="bg-background-card border border-border rounded-2xl p-5">
        <div className="text-[11px] text-gray-500 uppercase tracking-widest mb-2">Rendimientos</div>
        <div className="text-xl font-bold mono text-accent-amber">{formatEur(summary.totalRendimientos)}</div>
        <div className="text-[10px] text-gray-600 mt-1.5">{summary.numRendimientos} operaciones</div>
      </div>
    </div>
  )
}
