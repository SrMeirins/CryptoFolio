import { InfoTooltip } from './InfoTooltip'
import { AnimatedNumber } from './AnimatedNumber'
import { Change24hChip } from './Change24hChip'
import { cardClasses } from './ui'

// Variación de 24h, mostrada como chip en la línea secundaria de la tarjeta
// Valor (#210). Nunca se oculta: sin dato se muestra "24h —" con el motivo (#147).
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
  /** Línea secundaria bajo el valor (#210); hasta dos líneas. */
  secondary?: React.ReactNode
}

export function MetricCard({
  label, value, rawValue, format, positive, loading, tooltip, change24h, secondary,
}: MetricCardProps) {
  const colorClass =
    positive === undefined ? 'text-fg' :
    positive ? 'text-positive' : 'text-negative'

  return (
    // Rejilla fija de tres filas (#210): etiqueta, valor y línea secundaria
    // ocupan la misma altura en todas las tarjetas, haya o no dato secundario,
    // así que quedan alineadas entre sí en cualquier ancho.
    <div className={cardClasses('none', 'metric-card px-5 py-5 grid grid-rows-[1.25rem_2rem_2.5rem] justify-items-center items-center text-center gap-y-2')}>
      <div className="flex items-center justify-center gap-1.5 min-w-0">
        <p className="text-[11px] text-fg-subtle font-medium uppercase tracking-widest leading-none whitespace-nowrap">{label}</p>
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

      <div className="self-start flex flex-col items-center gap-0.5 text-xs text-fg-subtle mono leading-tight">
        {change24h && <Change24hChip change={change24h} />}
        {secondary}
      </div>
    </div>
  )
}
