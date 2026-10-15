import { heatBackground } from '../../../utils/topMovers'
import { formatMoneyCompact, type Currency } from '../../../utils/format'

// Leyenda de la escala de color del calendario (#216, #234): la misma del
// mapa de calor, de la mayor pérdida a la mayor ganancia del periodo mostrado.
export function CalendarLegend({ maxAbs, currency }: { maxAbs: number; currency: Currency }) {
  if (maxAbs <= 0) return null
  return (
    <div className="flex items-center justify-end gap-2 mt-3 text-[11px] text-fg-subtle mono"
      aria-label={`Escala de color: de ${formatMoneyCompact(-maxAbs, currency)} a +${formatMoneyCompact(maxAbs, currency)}`}>
      <span aria-hidden="true">{formatMoneyCompact(-maxAbs, currency)}</span>
      <span aria-hidden="true" className="w-40 h-2 rounded-full"
        style={{ background: `linear-gradient(90deg, ${heatBackground(-maxAbs, maxAbs)}, ${heatBackground(-maxAbs / 4, maxAbs)}, var(--cf-bg-tertiary), ${heatBackground(maxAbs / 4, maxAbs)}, ${heatBackground(maxAbs, maxAbs)})` }} />
      <span aria-hidden="true">+{formatMoneyCompact(maxAbs, currency)}</span>
    </div>
  )
}
