import { InfoTooltip } from './InfoTooltip'
import { AnimatedNumber } from './AnimatedNumber'

// Variación de 24h mostrada bajo el valor. Nunca se oculta: sin dato se
// muestra "24h —" con el motivo (#147).
export type Change24h =
  | { kind: 'value'; eur: string; pct: string; positive: boolean; note?: React.ReactNode }
  | { kind: 'unavailable'; reason: string }

interface MetricCardProps {
  label: string
  value: string
  rawValue?: number
  format?: (v: number) => string
  positive?: boolean
  loading?: boolean
  tooltip?: React.ReactNode
  change24h?: Change24h
}

export function MetricCard({
  label, value, rawValue, format, positive, loading, tooltip, change24h,
}: MetricCardProps) {
  const colorClass =
    positive === undefined ? 'text-white' :
    positive ? 'text-accent-green' : 'text-accent-red'

  return (
    <div className="bg-background-card border border-border rounded-2xl px-5 py-5 flex flex-col items-center text-center gap-2">
      <div className="flex items-center gap-1.5">
        <p className="text-[11px] text-gray-500 font-medium uppercase tracking-widest leading-none">{label}</p>
        {tooltip && <InfoTooltip label={label}>{tooltip}</InfoTooltip>}
      </div>

      {loading
        ? <div className="h-8 w-32 skeleton rounded-lg" />
        : (
          <p className={`text-[1.65rem] font-semibold tracking-tight leading-none mono animate-value-reveal ${colorClass}`}>
            {rawValue !== undefined && format
              ? <AnimatedNumber value={rawValue} format={format} />
              : value
            }
          </p>
        )
      }

      {change24h?.kind === 'value' && (
        <div className="inline-flex items-center gap-1.5">
          <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border ${
            change24h.positive
              ? 'bg-accent-green/8 border-accent-green/20'
              : 'bg-accent-red/8 border-accent-red/20'
          }`}>
            <span aria-hidden="true" className={`text-[11px] ${change24h.positive ? 'text-accent-green' : 'text-accent-red'}`}>
              {change24h.positive ? '▲' : '▼'}
            </span>
            <span className={`text-xs font-bold font-mono ${change24h.positive ? 'text-accent-green' : 'text-accent-red'}`}>
              {change24h.eur}
            </span>
            <span className={`text-[10px] font-mono ${change24h.positive ? 'text-accent-green/70' : 'text-accent-red/70'}`}>
              ({change24h.pct})
            </span>
            <span className="text-[10px] text-gray-600">24h</span>
          </div>
          {change24h.note && <InfoTooltip label="Cobertura de la variación 24h">{change24h.note}</InfoTooltip>}
        </div>
      )}
      {change24h?.kind === 'unavailable' && (
        <div className="inline-flex items-center gap-1.5">
          <span className="inline-flex items-center px-2.5 py-1 rounded-lg border border-border text-[10px] text-gray-500 font-mono">
            24h —
          </span>
          <InfoTooltip label="Variación 24h no disponible">{change24h.reason}</InfoTooltip>
        </div>
      )}
    </div>
  )
}
