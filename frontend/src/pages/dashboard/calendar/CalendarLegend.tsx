import type { CSSProperties } from 'react'
import { heatVars } from '../../../utils/topMovers'
import { legendScale, legendSteps, stepLabel } from '../../../utils/calendarLegend'
import { InfoTooltip } from '../../../components/InfoTooltip'
import type { Currency } from '../../../utils/format'

// Leyenda de la escala de color del calendario (#216, #234, #248): casillas
// con el mismo color que las celdas, de la mayor pérdida a la mayor ganancia,
// rotuladas y con el 0 en el centro. Antes era un degradado entre dos importes
// sin explicar qué representaban.
export function CalendarLegend({ maxAbs, currency }: { maxAbs: number; currency: Currency }) {
  const steps = legendSteps(maxAbs)
  if (steps.length === 0) return null
  const scale = legendScale(maxAbs, currency)
  return (
    <div className="flex items-center justify-end gap-x-3 gap-y-1.5 mt-3 flex-wrap text-[11px] text-fg-subtle">
      <div role="img" aria-label={`Escala de color del calendario: de pérdida a ganancia. ${scale}.`}
        className="flex items-center gap-1.5">
        <span aria-hidden="true">Pérdida</span>
        <span aria-hidden="true" className="flex items-center gap-0.5">
          {steps.map(value => (
            // Con el mismo marco de intensidad que las celdas (#412).
            <span key={value} title={stepLabel(value, currency)}
              className={`size-3 rounded-[3px] ${value === 0 ? 'border border-border mx-1 bg-background-card' : 'heat-swatch'}`}
              style={value === 0 ? undefined : heatVars(value, maxAbs) as CSSProperties} />
          ))}
        </span>
        <span aria-hidden="true">Ganancia</span>
      </div>
      <span className="inline-flex items-center gap-1 mono">
        {scale}
        <InfoTooltip label="Escala de color">
          <p>Cada día se colorea según su P&L: rojo si pierde, verde si gana, y más intenso cuanto mayor es el importe.</p>
          <p className="mt-1.5 text-fg-subtle">El color más intenso corresponde al mayor movimiento del mes visible, en pérdida o en ganancia; la casilla del centro es un día sin variación.</p>
        </InfoTooltip>
      </span>
    </div>
  )
}
