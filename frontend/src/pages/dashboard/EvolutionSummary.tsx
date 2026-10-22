import type { ReactNode } from 'react'
import { ArrowDownRight, ChevronDown, TrendingDown, TrendingUp } from 'lucide-react'
import { InfoTooltip } from '../../components/InfoTooltip'
import { panelEnterStyle } from '../../components/ui'
import { formatMoney, formatPercent, type Currency } from '../../utils/format'
import type { PeriodSummary } from '../../utils/evolutionSummary'
import { summaryTiles, type SummaryTile, type TileId, type TileTone } from '../../utils/evolutionTiles'

// Resumen del periodo del gráfico de evolución (#214, #250): titular con la
// rentabilidad y el P&L (o la variación del valor en la pestaña Valor) y tres
// mini-tarjetas: mejor día, peor día (u hora en 24H) y máxima caída. Mejor y
// peor día abren el detalle de ese día.

const signedMoney = (n: number, currency: Currency) => `${n >= 0 ? '+' : ''}${formatMoney(n, currency)}`

const ICONS: Record<TileId, typeof TrendingUp> = { best: TrendingUp, worst: TrendingDown, drawdown: ArrowDownRight }

const TONES: Record<TileTone, { text: string; icon: string; badge: string }> = {
  positive: { text: 'text-positive', icon: 'bg-positive/12 text-positive-ink', badge: 'bg-positive/10 text-positive-ink' },
  negative: { text: 'text-negative', icon: 'bg-negative/12 text-negative-ink', badge: 'bg-negative/10 text-negative-ink' },
  neutral: { text: 'text-fg-subtle', icon: 'bg-overlay/6 text-fg-subtle', badge: 'bg-overlay/6 text-fg-subtle' },
}

function Tile({ tile, index, open, onOpen }: { tile: SummaryTile; index: number; open: boolean; onOpen?: (day: string) => void }) {
  const tone = TONES[tile.tone]
  const Icon = ICONS[tile.id]
  const clickable = tile.day !== null && !!onOpen
  const body = (
    <>
      <span className={`size-8 rounded-lg grid place-items-center shrink-0 ${tone.icon}`} aria-hidden="true">
        <Icon size={16} strokeWidth={2.25} />
      </span>
      <span className="min-w-0 flex-1 text-left">
        <span className="block text-[10px] uppercase tracking-wider text-fg-subtle leading-none">{tile.label}</span>
        <span className="flex items-baseline gap-1.5 mt-1 flex-wrap">
          <span className={`mono text-[15px] font-semibold leading-tight ${tone.text}`}>{tile.value}</span>
          {tile.badge && <span className={`mono text-[10px] font-semibold px-1.5 py-0.5 rounded-md ${tone.badge}`}>{tile.badge}</span>}
        </span>
        <span className="block text-[11px] text-fg-subtle mt-0.5 truncate">{tile.detail}</span>
      </span>
    </>
  )
  const frame = 'panel-in relative flex items-center gap-3 rounded-xl border pl-3 pr-7 py-2.5 min-w-0'
  return (
    <div className={`${frame} ${clickable ? 'transition-colors hover:bg-overlay/5 hover:border-fg-subtle/30' : ''} ${open ? 'border-brand/50 bg-brand/5' : 'border-border bg-overlay/2'}`}
      style={panelEnterStyle(index)}>
      {clickable
        ? (
          <button type="button" onClick={() => onOpen(tile.day!)} aria-expanded={open}
            aria-label={`${tile.label}: ${tile.value}${tile.badge ? ` (${tile.badge})` : ''}, ${tile.detail}. ${open ? 'Ocultar' : 'Ver'} el detalle del día`}
            className="flex items-center gap-3 flex-1 min-w-0 rounded-lg focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand/60 cursor-pointer">
            {body}
            <ChevronDown size={14} aria-hidden="true" className={`absolute bottom-2 right-2 text-fg-subtle transition-transform ${open ? 'rotate-180' : ''}`} />
          </button>
        )
        : <div className="flex items-center gap-3 flex-1 min-w-0">{body}</div>}
      <span className="absolute top-2 right-2">
        <InfoTooltip label={tile.label}>{tile.help}</InfoTooltip>
      </span>
    </div>
  )
}

export function EvolutionSummary({ summary, currency, intraday, mode, valueChange, metricLabel, metricHelp, extra, openDay = null, onOpenDay }: {
  summary: PeriodSummary | null
  currency: Currency
  intraday: boolean
  mode: 'pnl' | 'value'
  valueChange: number | null
  metricLabel: string
  metricHelp: ReactNode
  extra?: ReactNode
  /** Día cuyo detalle está abierto bajo el resumen. */
  openDay?: string | null
  onOpenDay?: (day: string) => void
}) {
  const headline = mode === 'value' ? valueChange : summary?.pct ?? null
  const positive = (headline ?? 0) >= 0
  const tiles = summaryTiles(summary, intraday, currency)
  return (
    <div className="mb-4 space-y-3">
      <div className="flex items-center justify-between gap-x-4 gap-y-2 min-h-8 flex-wrap">
        <div className="flex items-center gap-x-3 gap-y-1 flex-wrap" aria-live="polite">
          {summary && headline !== null && (
            <p className="flex items-baseline gap-2 flex-wrap">
              <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg mono text-sm font-bold leading-none ${positive ? 'bg-positive/12 text-positive-ink' : 'bg-negative/12 text-negative-ink'}`}>
                <span aria-hidden="true">{positive ? '▲' : '▼'}</span>
                {mode === 'value' ? signedMoney(valueChange ?? 0, currency) : formatPercent(summary.pct, 2, true)}
              </span>
              <span className={`mono text-sm font-semibold ${positive ? 'text-positive' : 'text-negative'}`}>
                {mode === 'value' ? <span className="text-xs font-normal text-fg-subtle">en el periodo</span> : signedMoney(summary.pnl, currency)}
              </span>
            </p>
          )}
          <span className="inline-flex items-center gap-1 text-xs text-fg-subtle">
            {metricLabel}
            <InfoTooltip label={metricLabel}>{metricHelp}</InfoTooltip>
          </span>
        </div>
        <div className="flex items-center gap-3 flex-wrap">{extra}</div>
      </div>

      {summary && (
        <div className="grid gap-2 grid-cols-[repeat(auto-fit,minmax(13rem,1fr))]">
          {tiles.map((tile, i) => (
            <Tile key={tile.id} tile={tile} index={i} open={tile.day !== null && tile.day === openDay} onOpen={onOpenDay} />
          ))}
        </div>
      )}
    </div>
  )
}
