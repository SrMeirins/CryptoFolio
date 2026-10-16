import { formatPercent, formatPrice, type Currency } from '../utils/format'
import { breakEvenDistance } from '../utils/portfolioView'
import { recoveryText } from '../utils/fxEffect'

// Celda de break-even de Portfolio (#271): precio medio de compra y distancia
// del precio actual. La barra tiene el break-even en el centro y crece hacia
// la derecha en beneficio y hacia la izquierda en pérdida.
export function BreakEvenCell({ price, avgPrice, currency }: { price: number; avgPrice: number | null; currency: Currency }) {
  if (avgPrice === null || !(avgPrice > 0)) return <span className="text-fg-subtle">—</span>
  const d = breakEvenDistance(price, avgPrice)
  const up = (d?.pct ?? 0) >= 0
  const width = d ? Math.min(Math.abs(d.pct), 100) / 2 : 0
  const label = d
    ? up
      ? `${formatPercent(d.pct, 1, true)} sobre el precio medio`
      : `${formatPercent(d.pct, 1, true)}; hace falta subir ${formatPercent(d.toRecover, 1)} para recuperar lo invertido. ${recoveryText(d.pct) ?? ''}`
    : 'Sin precio actual'
  return (
    <div className="flex flex-col items-end gap-1" title={label}>
      <span className="text-fg-muted">{formatPrice(avgPrice, currency)}</span>
      {d && (
        <>
          <span className="relative block w-16 h-1.5 rounded-full bg-overlay/8" aria-hidden="true">
            <span className="absolute left-1/2 -top-0.5 w-px h-2 bg-fg-subtle/70" />
            <span className={`absolute top-0 h-1.5 rounded-full ${up ? 'bg-positive' : 'bg-negative'}`}
              style={{ width: `${width}%`, left: up ? '50%' : `${50 - width}%` }} />
          </span>
          <span className={`text-[11px] leading-none ${up ? 'text-positive' : 'text-negative'}`}>
            <span className="sr-only">{label}</span>
            <span aria-hidden="true">{up ? formatPercent(d.pct, 1, true) : `+${formatPercent(d.toRecover, 1)} para recuperar`}</span>
          </span>
        </>
      )}
    </div>
  )
}
