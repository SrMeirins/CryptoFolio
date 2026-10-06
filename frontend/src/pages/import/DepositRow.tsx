import { useState } from 'react'
import type { DepositReview } from './types'
import { HistoricalPriceButton } from './HistoricalPriceButton'

// Fila de depósito individual
export function DepositRow({ dep, cost, reviewed, onSetCost }: {
  dep: DepositReview
  cost: number | null | undefined
  reviewed: boolean
  onSetCost: (txKey: string, v: number | null) => void
}) {
  const [inputVal, setInputVal] = useState(cost != null ? String(cost) : '')
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
    : cost != null ? `${cost.toLocaleString('es-ES', { maximumFractionDigits: 6 })} €/ud.`
    : 'desconocido'

  return (
    <div className="px-4 py-3">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xs text-gray-400 mono">{date}</span>
        <span className="text-xs text-gray-600">·</span>
        <span className="text-xs text-gray-300 mono">
          {dep.amount.toLocaleString('es-ES', { maximumFractionDigits: 6 })} {dep.asset}
        </span>
        {statusLabel && (
          <span className={`ml-auto text-[10px] font-medium ${cost != null ? 'text-accent-green' : 'text-gray-500'}`}>
            {cost != null ? `✓ ${statusLabel}` : `○ ${statusLabel}`}
          </span>
        )}
        {!reviewed && <span className="ml-auto text-[10px] text-accent-amber">● pendiente</span>}
      </div>

      <div className="flex items-center gap-2">
        <div className="relative flex items-center flex-1 max-w-48">
          <input
            type="text"
            inputMode="decimal"
            placeholder="0,000000"
            value={inputVal}
            onChange={e => handleInput(e.target.value)}
            className={`w-full bg-background-primary border rounded-lg pl-3 pr-12 py-1.5 text-xs text-white placeholder-gray-700 focus:outline-none mono transition-colors ${
              reviewed && cost != null ? 'border-accent-green/40 focus:border-accent-green' : 'border-border focus:border-accent-blue'
            }`}
          />
          <span className="absolute right-3 text-[10px] text-gray-600 pointer-events-none">€/ud.</span>
        </div>

        <HistoricalPriceButton
          asset={dep.asset}
          timestamp={dep.timestamp}
          onPrice={p => { setInputVal(String(p)); onSetCost(dep.txKey, p) }}
        />

        <button
          type="button"
          onClick={() => { setInputVal('0'); onSetCost(dep.txKey, 0) }}
          className={`text-[10px] px-2.5 py-1.5 rounded-lg border transition-colors whitespace-nowrap ${
            cost === 0 && reviewed
              ? 'border-accent-green/40 bg-accent-green/10 text-accent-green'
              : 'border-border text-gray-500 hover:text-white hover:border-gray-500 bg-background-card'
          }`}
          title="Coste 0€ — airdrop, regalo, minería, etc."
        >
          Gratis (0€)
        </button>

        <button
          type="button"
          onClick={() => { setInputVal(''); onSetCost(dep.txKey, null) }}
          className={`text-[10px] px-2.5 py-1.5 rounded-lg border transition-colors whitespace-nowrap ${
            cost == null && reviewed
              ? 'border-gray-600 bg-gray-800 text-gray-300'
              : 'border-border text-gray-500 hover:text-white hover:border-gray-500 bg-background-card'
          }`}
          title="Coste desconocido — se usará el precio de mercado en la fecha"
        >
          No sé
        </button>
      </div>
    </div>
  )
}
