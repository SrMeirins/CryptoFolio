import { formatPercent, formatPrice, type Currency } from '../utils/format'
import { breakEvenDistance } from '../utils/portfolioView'
import { breakEvenBar } from '../utils/positionMetrics'
import { recoveryText } from '../utils/fxEffect'
import { TextTooltip } from './ui'

// Celda de break-even de Portfolio (#271, rediseñada en #527): el precio medio
// de compra arriba, una barra que va del precio actual (punto) a la marca del
// coste y, debajo, la distancia en palabras. Cada dato en su línea, sin
// solaparse; el sentido se lee por el texto, no solo por el color.
export function BreakEvenCell({ price, avgPrice, currency }: { price: number; avgPrice: number | null; currency: Currency }) {
  if (avgPrice === null || !(avgPrice > 0)) return <span className="text-fg-subtle">—</span>
  const d = breakEvenDistance(price, avgPrice)
  const bar = breakEvenBar(price, avgPrice)
  const label = d
    ? d.pct >= 0
      ? `${formatPercent(d.pct, 1, true)} sobre el precio medio`
      : `${formatPercent(d.pct, 1, true)}; hace falta subir ${formatPercent(d.toRecover, 1)} para recuperar lo invertido. ${recoveryText(d.pct) ?? ''}`
    : 'Sin precio actual'
  const pct = (n: number) => `${(n * 100).toFixed(2)}%`
  return (
    <div className="flex flex-col items-end">
      <TextTooltip label="Precio medio" tip={label} className="flex flex-col items-end gap-1">
        <span className="text-fg-muted leading-none">{formatPrice(avgPrice, currency)}</span>
        {d && bar && (
          <>
            <span className="relative block w-20 h-3" aria-hidden="true" data-testid="breakeven-bar">
              <span className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-1 rounded-full bg-overlay/10" />
              <span className={`absolute top-1/2 -translate-y-1/2 h-1 rounded-full ${bar.up ? 'bg-positive/70' : 'bg-negative/70'}`}
                style={{ left: pct(Math.min(bar.cost, bar.price)), width: pct(Math.abs(bar.cost - bar.price)) }} />
              {/* Marca del coste: raya vertical */}
              <span className="absolute top-0 h-3 w-0.5 -translate-x-1/2 rounded-full bg-fg-muted" style={{ left: pct(bar.cost) }} />
              {/* Precio actual: punto con borde */}
              <span className={`absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-background-card ${bar.up ? 'bg-positive' : 'bg-negative'}`}
                style={{ left: pct(bar.price) }} />
            </span>
            <span className={`text-[11px] leading-none whitespace-nowrap ${bar.up ? 'text-positive-ink' : 'text-negative-ink'}`}>
              <span className="sr-only">{label}</span>
              <span aria-hidden="true">{bar.up ? `${formatPercent(d.pct, 1, true)} sobre coste` : `falta ${formatPercent(d.toRecover, 1, true)}`}</span>
            </span>
          </>
        )}
      </TextTooltip>
    </div>
  )
}
