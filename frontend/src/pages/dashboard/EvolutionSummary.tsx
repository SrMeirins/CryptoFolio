import type { ReactNode } from 'react'
import { InfoTooltip } from '../../components/InfoTooltip'
import { formatMoney, formatPercent, type Currency } from '../../utils/format'
import { formatTick } from '../../utils/chartAxes'
import type { PeriodSummary } from '../../utils/evolutionSummary'

// Fila de resumen del periodo (#214): cifra principal a la izquierda (rentabilidad
// y P&L, o variación del valor en la pestaña Valor) y, en pequeño, mejor y peor
// día (u hora en 24H) y máxima caída.

const signedMoney = (n: number, currency: Currency) => `${n >= 0 ? '+' : ''}${formatMoney(n, currency)}`
const HOUR = 3_600_000
const SHORT_DAY = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', year: '2-digit', timeZone: 'UTC' })

/** Fecha corta («12 oct 26») o, en 24H, la hora («14:15»). */
const short = (x: number, intraday: boolean) => (intraday ? formatTick(x, 'hour3') : SHORT_DAY.format(new Date(x)).replace('.', ''))

/** Día del extremo o, en 24H, la franja horaria («14:00–15:00»). */
function when(x: number, intraday: boolean): string {
  return intraday ? `${formatTick(x, 'hour3')}–${formatTick(x + HOUR, 'hour3')}` : short(x, false)
}

function Stat({ label, value, detail, tone }: { label: string; value: string; detail: string; tone: string }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <dt className="text-fg-subtle">{label}</dt>
      <dd className="flex items-baseline gap-1.5">
        <span className={`mono font-medium ${tone}`}>{value}</span>
        <span className="text-fg-subtle">{detail}</span>
      </dd>
    </div>
  )
}

export function EvolutionSummary({ summary, currency, intraday, mode, valueChange, metricLabel, metricHelp, extra }: {
  summary: PeriodSummary | null
  currency: Currency
  intraday: boolean
  mode: 'pnl' | 'value'
  valueChange: number | null
  metricLabel: string
  metricHelp: ReactNode
  extra?: ReactNode
}) {
  const headline = mode === 'value' ? valueChange : summary?.pct ?? null
  const positive = (headline ?? 0) >= 0
  return (
    <div className="flex items-center justify-between gap-x-4 gap-y-2 mb-4 min-h-6 flex-wrap">
      <div className="flex items-center gap-3 flex-wrap" aria-live="polite">
        {summary && headline !== null && (
          <p className={`text-sm mono font-semibold ${positive ? 'text-positive' : 'text-negative'}`}>
            <span aria-hidden="true">{positive ? '▲' : '▼'} </span>
            {mode === 'value'
              ? <>{signedMoney(valueChange ?? 0, currency)} <span className="text-xs font-normal opacity-80">en el periodo</span></>
              : <>{formatPercent(summary.pct, 2, true)} <span className="text-xs font-normal opacity-80">({signedMoney(summary.pnl, currency)})</span></>}
          </p>
        )}
        <span className="inline-flex items-center gap-1 text-xs text-fg-subtle">
          {metricLabel}
          <InfoTooltip label={metricLabel}>{metricHelp}</InfoTooltip>
        </span>
      </div>

      <div className="flex items-center gap-4 flex-wrap">
        {summary && (
          <dl className="flex items-center gap-x-4 gap-y-1 flex-wrap text-xs">
            {summary.best && (
              <Stat label={intraday ? 'Mejor hora' : 'Mejor día'} value={formatPercent(summary.best.pct, 2, true)}
                detail={when(summary.best.x, intraday)} tone="text-positive" />
            )}
            {summary.worst && (
              <Stat label={intraday ? 'Peor hora' : 'Peor día'} value={formatPercent(summary.worst.pct, 2, true)}
                detail={when(summary.worst.x, intraday)} tone="text-negative" />
            )}
            {summary.drawdown && (
              <Stat label="Máx. caída" value={formatPercent(summary.drawdown.pct, 2)}
                detail={`${short(summary.drawdown.fromX, intraday)} → ${short(summary.drawdown.toX, intraday)}`}
                tone="text-negative" />
            )}
          </dl>
        )}
        {extra}
      </div>
    </div>
  )
}
