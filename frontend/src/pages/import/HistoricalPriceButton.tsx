import { useState } from 'react'
import { Zap, RefreshCw } from 'lucide-react'

// Botón auto-fetch precio de mercado (estimación, no necesariamente el coste real pagado)
export function HistoricalPriceButton({ asset, timestamp, onPrice, label = 'Precio de mercado (estimación)' }: {
  asset: string
  timestamp: string
  onPrice: (p: number) => void
  label?: string
}) {
  const [state, setState] = useState<'idle' | 'loading' | 'error'>('idle')

  async function fetch_() {
    setState('loading')
    try {
      const dateStr = new Date(timestamp).toISOString().slice(0, 10)
      const res = await fetch(`/api/prices/historical?asset=${asset}&date=${dateStr}`)
      if (res.ok) {
        const d = await res.json()
        if (d.price_eur > 0) { onPrice(d.price_eur); setState('idle') }
        else setState('error')
      } else { setState('error') }
    } catch { setState('error') }
  }

  if (state === 'error') {
    return (
      <button
        type="button"
        onClick={() => setState('idle')}
        className="text-[10px] px-2 py-1 rounded-md border border-accent-red/40 text-accent-red bg-accent-red/5 transition-colors"
      >
        Sin precio en Binance ✕
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={fetch_}
      disabled={state === 'loading'}
      title="Precio de mercado en esa fecha — puede no coincidir con lo que pagaste realmente en el exchange de origen. Corrígelo si sabes tu coste real."
      className="text-[10px] px-2 py-1 rounded-md border border-accent-blue/30 text-accent-blue bg-accent-blue/5 hover:bg-accent-blue/15 transition-colors disabled:opacity-50 flex items-center gap-1"
    >
      {state === 'loading' ? <RefreshCw size={9} className="animate-spin" /> : <Zap size={9} />}
      {label}
    </button>
  )
}
