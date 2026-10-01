import { Link } from 'react-router-dom'
import type { FiscalYear } from '../../api/portfolio'
import { formatEur } from '../../utils/format'

export function FiscalCard({ data }: { data: FiscalYear[] }) {
  const currentYear = new Date().getFullYear()
  const current = data.find((fy) => fy.fiscal_year === currentYear) ?? data[data.length - 1]
  if (!current) return null

  const gainLoss = parseFloat(current.total_gain_loss_eur)
  const gains    = parseFloat(current.total_gains_eur)
  const losses   = parseFloat(current.total_losses_eur)
  const ops      = parseInt(current.num_operations, 10)
  const isPos    = gainLoss >= 0
  const accentColor = isPos ? '#10b981' : '#ef4444'

  return (
    <div className="bg-background-card border border-border rounded-2xl overflow-hidden flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold tracking-widest text-gray-600 uppercase">Fiscal</span>
          <span className="text-[11px] font-bold text-white bg-white/6 border border-white/10 px-2 py-0.5 rounded-md">
            {current.fiscal_year}
          </span>
        </div>
        <Link to="/fiscal" className="text-xs text-accent-blue hover:underline">Detalle →</Link>
      </div>

      {/* Métrica principal — centrada */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-5 gap-1">
        <p className="text-[10px] text-gray-600 font-medium uppercase tracking-widest">G/P neto realizado</p>
        <p className={`font-['JetBrains_Mono',monospace] text-[1.7rem] font-bold tracking-tight leading-none ${isPos ? 'text-accent-green' : 'text-accent-red'}`}>
          {isPos ? '+' : ''}{formatEur(gainLoss)}
        </p>
        <div
          className="mt-1 px-2 py-0.5 rounded-md text-[10px] font-semibold"
          style={{ background: `${accentColor}15`, color: accentColor }}
        >
          {ops} operacion{ops !== 1 ? 'es' : ''}
        </div>
      </div>

      {/* Desglose */}
      <div className="mx-3 mb-3 rounded-xl bg-white/[0.03] border border-white/5 divide-y divide-white/5">
        <div className="flex items-center justify-between px-3 py-2">
          <span className="text-[11px] text-gray-500">Ganancias</span>
          <span className="font-['JetBrains_Mono',monospace] text-[11px] font-semibold text-accent-green">+{formatEur(gains)}</span>
        </div>
        <div className="flex items-center justify-between px-3 py-2">
          <span className="text-[11px] text-gray-500">Pérdidas</span>
          <span className="font-['JetBrains_Mono',monospace] text-[11px] font-semibold text-accent-red">{formatEur(losses)}</span>
        </div>
      </div>
    </div>
  )
}
