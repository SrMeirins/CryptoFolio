import { Link } from 'react-router-dom'
import type { FiscalYear } from '../../api/portfolio'
import { formatEur } from '../../utils/format'
import { EurOnlyBadge } from '../../components/EurOnlyBadge'
import { AnimatedNumber } from '../../components/AnimatedNumber'
import { T, alpha } from '../../utils/colors'
import { cardClasses, PanelHeader } from '../../components/ui'
import { fiscalSubtitle } from '../../utils/panelSubtitles'
import { Landmark } from 'lucide-react'

export function FiscalCard({ data }: { data: FiscalYear[] }) {
  const currentYear = new Date().getFullYear()
  const current = data.find((fy) => fy.fiscal_year === currentYear) ?? data[data.length - 1]
  if (!current) return null

  const gainLoss = parseFloat(current.total_gain_loss_eur)
  const gains    = parseFloat(current.total_gains_eur)
  const losses   = parseFloat(current.total_losses_eur)
  const ops      = parseInt(current.num_operations, 10)
  const isPos    = gainLoss >= 0
  const accentColor = isPos ? T.positive : T.negative

  return (
    <div className={cardClasses('none', 'overflow-hidden flex flex-col h-full')}>
      {/* Header */}
      <PanelHeader
        icon={Landmark}
        title="Fiscal"
        className="px-5 py-4 border-b border-border"
        extra={<EurOnlyBadge />}
        subtitle={fiscalSubtitle(current.fiscal_year, ops)}
        actions={<Link to="/fiscal" className="text-xs text-brand hover:underline">Detalle →</Link>}
      />

      {/* Métrica principal — centrada */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-5 gap-1">
        <p className="text-[11px] text-fg-subtle font-medium uppercase tracking-widest">G/P neto realizado</p>
        <p className={`mono text-[1.7rem] font-bold tracking-tight leading-none ${isPos ? 'text-positive' : 'text-negative'}`}>
          <AnimatedNumber value={gainLoss} countUp format={v => `${v >= 0 ? '+' : ''}${formatEur(v)}`} />
        </p>
        <div
          className="mt-1 px-2 py-0.5 rounded-lg text-xs font-semibold"
          style={{ background: `${alpha(accentColor, 8)}`, color: accentColor }}
        >
          {ops} operacion{ops !== 1 ? 'es' : ''}
        </div>
      </div>

      {/* Desglose */}
      <div className="mx-3 mb-3 rounded-xl bg-overlay/3 border border-overlay/5 divide-y divide-overlay/5">
        <div className="flex items-center justify-between px-3 py-2">
          <span className="text-xs text-fg-subtle">Ganancias</span>
          <span className="mono text-xs font-semibold text-positive">+{formatEur(gains)}</span>
        </div>
        <div className="flex items-center justify-between px-3 py-2">
          <span className="text-xs text-fg-subtle">Pérdidas</span>
          <span className="mono text-xs font-semibold text-negative">{formatEur(losses)}</span>
        </div>
      </div>
    </div>
  )
}
