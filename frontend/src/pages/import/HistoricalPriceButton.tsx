import { useState } from 'react'
import { Zap } from 'lucide-react'
import { Button } from '../../components/ui'

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
        className="text-xs px-2 py-1 rounded-lg border border-negative/40 text-negative bg-negative/5 transition-colors"
      >
        Sin precio en Binance ✕
      </button>
    )
  }

  return (
    <Button variant="ghost" size="sm" loading={state === 'loading'} icon={<Zap size={9} aria-hidden="true" />}
      onClick={fetch_}
      title="Precio de mercado en esa fecha: puede no coincidir con lo que pagaste realmente en el exchange de origen. Corrígelo si sabes tu coste real."
      className="text-xs px-2 py-1 rounded-lg border border-brand/30 text-brand-ink hover:text-brand-ink bg-brand/5 hover:bg-brand/15 gap-1"
    >
      {label}
    </Button>
  )
}
