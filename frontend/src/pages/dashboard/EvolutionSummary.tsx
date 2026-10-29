import type { ReactNode } from 'react'
import { ArrowDownRight, TrendingDown, TrendingUp } from 'lucide-react'
import { InfoTooltip } from '../../components/InfoTooltip'
import { StatCard } from '../../components/ui'
import { formatMoney, formatPercent, type Currency } from '../../utils/format'
import { T } from '../../utils/colors'
import type { PeriodSummary } from '../../utils/evolutionSummary'
import { summaryTiles, tileChip, type SummaryTile, type TileId, type TileTone } from '../../utils/evolutionTiles'

// Resumen del periodo del gráfico de evolución (#214, #250): titular con la
// rentabilidad y el P&L (o la variación del valor en la pestaña Valor) y tres
// mini tarjetas StatCard (#412): mejor día, peor día (u hora en 24H) y máxima
// caída. Bajo la cifra, un chip con el % y la fecha; la explicación, en la
// ayuda. Mejor y peor día despliegan el detalle de ese día.

const signedMoney = (n: number, currency: Currency) => `${n >= 0 ? '+' : ''}${formatMoney(n, currency)}`

const ICONS: Record<TileId, typeof TrendingUp> = { best: TrendingUp, worst: TrendingDown, drawdown: ArrowDownRight }

const TONES: Record<TileTone, { color: string; tone?: 'positive' | 'negative'; chip: string }> = {
  positive: { color: T.positive, tone: 'positive', chip: 'bg-positive/10 text-positive-ink' },
  negative: { color: T.negative, tone: 'negative', chip: 'bg-negative/10 text-negative-ink' },
  neutral: { color: T.muted, chip: 'bg-overlay/6 text-fg-subtle' },
}

function Tile({ tile, index, open, onOpen }: { tile: SummaryTile; index: number; open: boolean; onOpen?: (day: string) => void }) {
  const tone = TONES[tile.tone]
  const chip = tileChip(tile)
  const clickable = tile.day !== null && !!onOpen
  return (
    <StatCard compact title={tile.label} icon={ICONS[tile.id]} color={tone.color} tone={tone.tone}
      value={tile.value} delay={index * 60}
      chip={chip && <span className={`mono text-[11px] font-semibold px-1.5 py-0.5 rounded-md ${tone.chip}`}>{chip}</span>}
      help={<><p>{tile.help}</p>{tile.detail && (tile.id === 'drawdown' || tile.value === '—') && <p className="text-fg-muted">{tile.detail}.</p>}</>}
      helpLabel={`Qué mide ${tile.label}`}
      {...(clickable && {
        onSelect: () => onOpen(tile.day!), expands: true, active: open,
        actionLabel: `${chip ? `${chip}. ` : ''}${open ? 'Ocultar' : 'Ver'} el detalle del día`,
      })} />
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
