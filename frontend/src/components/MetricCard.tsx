import { InfoTooltip } from './InfoTooltip'
import { AnimatedNumber } from './AnimatedNumber'
import { Change24hChip } from './Change24hChip'

// Variación de 24h, mostrada como chip en la cabecera de la tarjeta para que
// todas las tarjetas tengan la misma altura (#152). Nunca se oculta: sin dato
// se muestra "24h —" con el motivo (#147).
export type Change24h =
  | {
      kind: 'value'
      eur: string          // detalle completo, p. ej. "-202,57 €"
      pct: string          // detalle completo, p. ej. "-2.03%"
      eurCompact: string   // chip, p. ej. "-203 €"
      pctCompact: string   // chip, p. ej. "-2.0%"
      positive: boolean
      note?: React.ReactNode
    }
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
    <div className="metric-card bg-background-card border border-border rounded-2xl px-5 py-5 flex flex-col items-center text-center gap-2">
      {/* Si una variación muy grande no cabe, el chip baja de línea en vez de desbordar */}
      <div className="flex flex-wrap items-center justify-center gap-x-1.5 gap-y-1">
        <p className="text-[11px] text-gray-500 font-medium uppercase tracking-widest leading-none whitespace-nowrap">{label}</p>
        {tooltip && <InfoTooltip label={label}>{tooltip}</InfoTooltip>}
        {change24h && <Change24hChip change={change24h} />}
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

    </div>
  )
}
