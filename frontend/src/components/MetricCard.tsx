import { useState, type ReactNode } from 'react'
import { InfoTooltip } from './InfoTooltip'
import { useFlashOnChange } from '../hooks/useFlashOnChange'
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
  /** Mini-gráfico al pie de la tarjeta (#251). */
  sparkline?: ReactNode
}

/**
 * Cifra principal (#251): cuenta desde 0 si la tarjeta se montó mientras
 * cargaba (la primera carga), destella al subir o bajar con los precios en
 * vivo y usa cifras tabulares para no bailar. Se monta ya con el dato, así
 * que la llegada de la primera cifra no cuenta como cambio.
 */
function MetricValue({ rawValue, format, countUp, className }: { rawValue: number; format: (v: number) => string; countUp: boolean; className: string }) {
  const flash = useFlashOnChange(rawValue)
  return (
    <p className={`${className} rounded-md px-1 ${flash === 'up' ? 'flash-up' : flash === 'down' ? 'flash-down' : ''}`}>
      <AnimatedNumber value={rawValue} format={format} countUp={countUp} duration={countUp ? 700 : 450} />
    </p>
  )
}

export function MetricCard({
  label, value, rawValue, format, positive, loading, tooltip, change24h, secondary, sparkline,
}: MetricCardProps) {
  // Solo la primera carga cuenta desde 0; al cambiar de moneda o volver con
  // los datos en caché la cifra aparece al instante.
  const [mountedLoading] = useState(!!loading)
  const colorClass =
    positive === undefined ? 'text-fg' :
    positive ? 'text-positive' : 'text-negative'

  return (
    // Rejilla fija de tres filas (#210): etiqueta, valor y línea secundaria
    // ocupan la misma altura en todas las tarjetas, haya o no dato secundario,
    // así que quedan alineadas entre sí en cualquier ancho.
    <div className={cardClasses('none', 'metric-card relative overflow-hidden px-5 py-5 grid grid-rows-[1.25rem_2rem_2.5rem] justify-items-center items-center text-center gap-y-2')}>
      {sparkline && !loading && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 opacity-70">{sparkline}</div>
      )}
      <div className="flex items-center justify-center gap-1.5 min-w-0">
        <p className="text-[11px] text-fg-subtle font-medium uppercase tracking-widest leading-none whitespace-nowrap">{label}</p>
        {tooltip && <InfoTooltip label={label}>{tooltip}</InfoTooltip>}
      </div>

      {loading
        ? <div className="h-8 w-32 skeleton rounded-lg" />
        : (
          rawValue !== undefined && format
            ? <MetricValue rawValue={rawValue} format={format} countUp={mountedLoading}
                className={`relative text-[1.65rem] font-semibold tracking-tight leading-none mono tabular-nums animate-value-reveal ${colorClass}`} />
            : <p className={`relative text-[1.65rem] font-semibold tracking-tight leading-none mono tabular-nums animate-value-reveal ${colorClass}`}>{value}</p>
        )
      }

      <div className="relative self-start flex flex-col items-center gap-0.5 text-xs text-fg-subtle mono leading-tight">
        {change24h && <Change24hChip change={change24h} />}
        {secondary}
      </div>
    </div>
  )
}
