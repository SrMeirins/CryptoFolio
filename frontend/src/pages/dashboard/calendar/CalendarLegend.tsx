import { colorAlpha } from '../../../utils/calendarStats'
import { T, alpha } from '../../../utils/colors'
import type { Currency } from '../../../utils/format'
import { formatMoneyCompact } from '../../../utils/format'

// Leyenda de la escala de color continua (#216): de la mayor pérdida a la
// mayor ganancia del periodo mostrado.
const STEPS = [1, 0.5, 0.15]

export function CalendarLegend({ maxAbs, currency }: { maxAbs: number; currency: Currency }) {
  if (maxAbs <= 0) return null
  const swatch = (color: string, ratio: number) => (
    <span key={`${color}-${ratio}`} className="w-4 h-3 rounded-sm border border-border/40"
      style={{ backgroundColor: alpha(color, colorAlpha(ratio * maxAbs, maxAbs)) }} />
  )
  return (
    <div className="flex items-center justify-end gap-1.5 mt-3 text-xs text-fg-subtle" aria-label={`Escala de color: de ${formatMoneyCompact(-maxAbs, currency)} a ${formatMoneyCompact(maxAbs, currency)}`}>
      <span className="mono" aria-hidden="true">{formatMoneyCompact(-maxAbs, currency)}</span>
      <span className="flex items-center gap-0.5" aria-hidden="true">
        {STEPS.map(r => swatch(T.negative, r))}
        <span className="w-4 h-3 rounded-sm border border-border/40" />
        {[...STEPS].reverse().map(r => swatch(T.positive, r))}
      </span>
      <span className="mono" aria-hidden="true">+{formatMoneyCompact(maxAbs, currency)}</span>
    </div>
  )
}
