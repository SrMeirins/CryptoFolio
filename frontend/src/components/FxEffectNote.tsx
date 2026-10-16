import type { FifoLot } from '../api/portfolio'
import { usePricesStore } from '../store/pricesStore'
import { liveRate } from '../utils/displayMarket'
import { fxEffect } from '../utils/fxEffect'
import { formatNumber, formatPercent } from '../utils/format'

// Nota del tooltip de Rentabilidad y P&L en USD (#281): por qué la cifra en
// dólares difiere de la de euros. El coste en USD usa el tipo del día de
// compra de cada lote y el valor, el de hoy.
export function FxEffectNote({ lots }: { lots: readonly FifoLot[] }) {
  const pricesEur = usePricesStore(s => s.prices)
  const e = fxEffect(lots, pricesEur, liveRate('USD', pricesEur))
  if (!e) return null
  const fmtRate = (r: number) => `${formatNumber(r, 4, 4)} $/€`
  return (
    <div className="mt-1.5 space-y-1">
      <p>En dólares, el coste usa el tipo EUR/USD del día de cada compra y el valor, el de hoy:</p>
      <div className="bg-overlay/5 rounded-lg px-3 py-2 space-y-1 text-xs tabular-nums">
        <div className="flex justify-between gap-4 text-fg-muted"><span>Tipo medio de compra</span><span className="mono text-fg whitespace-nowrap shrink-0">{fmtRate(e.avgRate)}</span></div>
        <div className="flex justify-between gap-4 text-fg-muted"><span>Tipo de hoy</span><span className="mono text-fg whitespace-nowrap shrink-0">{fmtRate(e.currentRate)}</span></div>
        <div className="flex justify-between gap-4 text-fg-muted">
          <span>Efecto del tipo de cambio</span>
          <span className={`mono whitespace-nowrap shrink-0 ${e.effectPp < 0 ? 'text-negative' : 'text-positive'}`}>{e.effectPp >= 0 ? '+' : ''}{formatNumber(e.effectPp, 2, 2)} pp</span>
        </div>
      </div>
      <p className="text-fg-subtle">
        Rentabilidad en euros {formatPercent(e.returnEur, 2, true)} frente a {formatPercent(e.returnUsd, 2, true)} en dólares:
        {e.effectPp < 0 ? ' el euro vale hoy menos dólares que cuando compraste.' : ' el euro vale hoy más dólares que cuando compraste.'}
      </p>
    </div>
  )
}
