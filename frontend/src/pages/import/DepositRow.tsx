import { useState } from 'react'
import type { DepositReview } from './types'
import { HistoricalPriceButton } from './HistoricalPriceButton'
import { formatEur, formatNumber } from '../../utils/format'
import { idDeposito } from './revisionHelpers'

// Fila de depósito individual
export function DepositRow({ dep, cost, reviewed, onSetCost, resaltado }: {
  dep: DepositReview
  resaltado: string | null
  cost: number | null | undefined
  reviewed: boolean
  onSetCost: (txKey: string, v: number | null) => void
}) {
  const [inputVal, setInputVal] = useState(cost != null ? String(cost) : '')
  // Un relleno masivo cambia el coste desde fuera: el campo lo refleja (#321).
  // (Ajuste de estado durante el render, el patrón recomendado frente a un efecto.)
  const [costPrevio, setCostPrevio] = useState(cost)
  if (cost !== costPrevio) {
    setCostPrevio(cost)
    if (cost != null && parseFloat(inputVal.replace(',', '.')) !== cost) setInputVal(String(cost))
  }
  const id = idDeposito(dep.txKey)
  const date = new Date(dep.timestamp).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })

  function handleInput(val: string) {
    setInputVal(val)
    const n = parseFloat(val.replace(',', '.'))
    if (!isNaN(n) && n >= 0) onSetCost(dep.txKey, n)
    // val === '' no escribe nada en el registro compartido (ver onSetCost): si
    // escribiéramos undefined, el spread merge dejaría la clave presente con
    // valor undefined — "revisado" a efectos de `txKey in costs`, pero
    // JSON.stringify() la descarta silenciosamente al enviar al backend, que
    // nunca recibiría el coste pese a que la UI lo daba por hecho.
  }

  const statusLabel = !reviewed ? null
    : cost != null ? `${formatNumber(cost, 6)} €/ud.`
    : 'desconocido'

  return (
    <div id={id} tabIndex={-1} className={`px-4 py-3 focus:outline-hidden transition-shadow ${resaltado === id ? 'ring-2 ring-inset ring-brand/60' : ''}`}>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xs text-fg-muted mono">{date}</span>
        <span className="text-xs text-fg-subtle">·</span>
        <span className="text-xs text-fg mono">
          {formatNumber(dep.amount, 6)} {dep.asset}
        </span>
        {statusLabel && (
          <span className={`ml-auto text-xs font-medium ${cost != null ? 'text-positive' : 'text-fg-subtle'}`}>
            {cost != null ? `✓ ${statusLabel}` : `○ ${statusLabel}`}
          </span>
        )}
        {!reviewed && <span className="ml-auto text-xs text-warning">● pendiente</span>}
      </div>

      {dep.historicalPrice != null && dep.historicalPrice > 0 && (
        <p className="text-[11px] text-fg-subtle mb-2">
          Mercado ese día: <span className="mono text-fg-muted">{formatNumber(dep.historicalPrice, 6)} €/ud.</span> · valor <span className="mono text-fg-muted">{formatEur(dep.historicalPrice * dep.amount)}</span>
        </p>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex items-center flex-1 max-w-48">
          <input
            type="text"
            inputMode="decimal"
            placeholder="0,000000"
            value={inputVal}
            onChange={e => handleInput(e.target.value)}
            aria-label={`Coste por unidad de ${dep.asset} del ${date}`}
            className={`w-full bg-background-primary border rounded-lg pl-3 pr-12 py-1.5 text-xs text-fg placeholder-fg-subtle focus:outline-hidden mono transition-colors ${
              reviewed && cost != null ? 'border-positive/40 focus:border-positive' : 'border-border focus:border-brand'
            }`}
          />
          <span className="absolute right-3 text-xs text-fg-subtle pointer-events-none">€/ud.</span>
        </div>

        {dep.historicalPrice != null && dep.historicalPrice > 0 ? (
          <button type="button" onClick={() => { setInputVal(String(dep.historicalPrice)); onSetCost(dep.txKey, dep.historicalPrice as number) }}
            className={`text-xs px-2.5 py-1.5 rounded-lg border transition-colors whitespace-nowrap ${
              reviewed && cost === dep.historicalPrice ? 'border-positive/40 bg-positive/10 text-positive-ink' : 'border-border text-fg-subtle hover:text-fg hover:border-fg-subtle bg-background-card'}`}>
            Usar mercado
          </button>
        ) : (
          <HistoricalPriceButton
            asset={dep.asset}
            timestamp={dep.timestamp}
            onPrice={p => { setInputVal(String(p)); onSetCost(dep.txKey, p) }}
          />
        )}

        <button
          type="button"
          onClick={() => { setInputVal('0'); onSetCost(dep.txKey, 0) }}
          className={`text-xs px-2.5 py-1.5 rounded-lg border transition-colors whitespace-nowrap ${
            cost === 0 && reviewed
              ? 'border-positive/40 bg-positive/10 text-positive-ink'
              : 'border-border text-fg-subtle hover:text-fg hover:border-fg-subtle bg-background-card'
          }`}
          title="Coste 0€ — airdrop, regalo, minería, etc."
        >
          Gratis (0€)
        </button>

        <button
          type="button"
          onClick={() => { setInputVal(''); onSetCost(dep.txKey, null) }}
          className={`text-xs px-2.5 py-1.5 rounded-lg border transition-colors whitespace-nowrap ${
            cost == null && reviewed
              ? 'border-border bg-background-tertiary text-fg'
              : 'border-border text-fg-subtle hover:text-fg hover:border-fg-subtle bg-background-card'
          }`}
          title="Coste desconocido — se usará el precio de mercado en la fecha"
        >
          No sé
        </button>
      </div>
    </div>
  )
}
