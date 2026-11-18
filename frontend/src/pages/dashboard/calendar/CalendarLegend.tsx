import { legendScale, legendSteps, posicionLeyenda, stepLabel } from '../../../utils/calendarLegend'
import { InfoTooltip } from '../../../components/InfoTooltip'
import type { Currency } from '../../../utils/format'
import { signedMoney } from './format'

// Leyenda de la escala de color del calendario (#216, #248; degradado desde
// #512): una barra de la mayor pérdida a la mayor ganancia con el 0 en el
// centro, con la misma escala de raíz cuadrada que las teselas. Un marcador
// sitúa en ella el día (o el mes) bajo el cursor o con el foco.
export function CalendarLegend({ maxAbs, currency, marcador = null, unidad = 'día' }: {
  maxAbs: number
  currency: Currency
  /** Importe del día o mes enfocado; null sin marcador. */
  marcador?: number | null
  unidad?: 'día' | 'mes'
}) {
  const steps = legendSteps(maxAbs)
  if (steps.length === 0) return null
  const scale = legendScale(maxAbs, currency)
  const pos = marcador === null ? null : posicionLeyenda(marcador, maxAbs)
  return (
    <div className="flex items-center justify-end gap-x-3 gap-y-1.5 mt-3 flex-wrap text-[11px] text-fg-subtle">
      <div role="img" aria-label={`Escala de color del calendario: de pérdida a ganancia. ${scale}.`}
        className="flex items-center gap-2">
        <span aria-hidden="true">Pérdida</span>
        <span aria-hidden="true" className="relative block w-40 h-2.5 rounded-full border border-border"
          style={{ background: 'linear-gradient(90deg, color-mix(in srgb, var(--cf-negative) 75%, var(--cf-bg-card)), var(--cf-bg-card) 50%, color-mix(in srgb, var(--cf-positive) 75%, var(--cf-bg-card)))' }}>
          <span className="absolute left-1/2 -top-0.5 -bottom-0.5 w-px bg-fg-subtle/60" />
          {pos !== null && (
            <span className="absolute -top-1.5 -bottom-1.5 w-1 -ml-0.5 rounded-full bg-fg shadow-[0_0_0_2px_var(--cf-bg-card)] transition-[left] duration-150 motion-reduce:transition-none"
              style={{ left: `${pos * 100}%` }} />
          )}
        </span>
        <span aria-hidden="true">Ganancia</span>
      </div>
      <span className="inline-flex items-center gap-1 mono min-w-0">
        {marcador !== null ? <span aria-hidden="true" className="text-fg-muted">Este {unidad}: {signedMoney(marcador, currency)}</span> : scale}
        <InfoTooltip label="Escala de color">
          <p>Cada {unidad} se colorea según su P&L: rojo si pierde, verde si gana, y más intenso cuanto mayor es el importe.</p>
          <p className="mt-1.5 text-fg-subtle">El color más intenso corresponde al mayor movimiento del {unidad === 'día' ? 'mes' : 'año'} visible, en pérdida o en ganancia; el centro es sin variación. Al pasar por un {unidad}, el marcador lo sitúa en la escala.</p>
          <ul className="mt-1.5 space-y-0.5 mono">{steps.map(v => <li key={v}>{stepLabel(v, currency)}</li>)}</ul>
        </InfoTooltip>
      </span>
    </div>
  )
}
