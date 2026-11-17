import type { ReactNode } from 'react'
import { InfoTooltip } from '../../components/InfoTooltip'
import type { Currency } from '../../utils/format'
import type { PeriodSummary } from '../../utils/evolutionSummary'

// Cabecera del resumen del gráfico de evolución (#214, #250, #509): la métrica
// con su ayuda y los controles de la pestaña (unidad o línea de aportado).
// Las cifras (resultado, máximo, mínimo, aportado, mejor y peor día) van en
// la tira de métricas de debajo, sin repetirse aquí.

export function EvolutionSummary({ metricLabel, metricHelp, extra }: {
  summary: PeriodSummary | null
  currency: Currency
  intraday: boolean
  mode: 'pnl' | 'value'
  valueChange: number | null
  metricLabel: string
  metricHelp: ReactNode
  extra?: ReactNode
}) {
  return (
    <div className="mb-3 flex items-center justify-between gap-x-4 gap-y-2 min-h-8 flex-wrap">
      <span className="inline-flex items-center gap-1 text-xs text-fg-subtle">
        {metricLabel}
        <InfoTooltip label={metricLabel}>{metricHelp}</InfoTooltip>
      </span>
      <div className="flex items-center gap-3 flex-wrap">{extra}</div>
    </div>
  )
}
