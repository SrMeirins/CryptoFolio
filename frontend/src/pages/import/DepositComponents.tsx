import { useState } from 'react'
import { AlertTriangle, Check, Zap, RefreshCw, ChevronRight } from 'lucide-react'
import { Play } from 'lucide-react'
import type { DepositReview, PreviewTransaction } from './types'

// Botón auto-fetch precio histórico
export function HistoricalPriceButton({ asset, timestamp, onPrice, label = 'Precio histórico' }: {
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
      <button onClick={() => setState('idle')}
        className="text-[10px] px-2 py-1 rounded-md border border-accent-red/40 text-accent-red bg-accent-red/5 transition-colors">
        Sin precio en Binance ✕
      </button>
    )
  }

  return (
    <button onClick={fetch_} disabled={state === 'loading'}
      className="text-[10px] px-2 py-1 rounded-md border border-accent-blue/30 text-accent-blue bg-accent-blue/5 hover:bg-accent-blue/15 transition-colors disabled:opacity-50 flex items-center gap-1">
      {state === 'loading' ? <RefreshCw size={9} className="animate-spin" /> : <Zap size={9} />}
      {label}
    </button>
  )
}

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
    else if (val === '') onSetCost(dep.txKey, undefined as unknown as null)
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

// Grupo de depósitos por activo
export function DepositAssetGroup({ asset, deposits, depositCosts, onSetCost }: {
  asset: string
  deposits: DepositReview[]
  depositCosts: Record<string, number | null>
  onSetCost: (txKey: string, price: number | null) => void
}) {
  const [expanded, setExpanded] = useState(true)
  const reviewedCount = deposits.filter(d => d.txKey in depositCosts).length
  const allReviewed   = reviewedCount === deposits.length
  const totalAmt      = deposits.reduce((s, d) => s + d.amount, 0)
  const hasMany       = deposits.length > 1

  function applyAll(price: number | null) {
    deposits.forEach(d => onSetCost(d.txKey, price))
  }

  return (
    <div className={`rounded-xl border ${allReviewed ? 'border-accent-green/30' : 'border-border'}`}>
      <div className={`flex items-center gap-3 px-4 py-3 rounded-t-xl ${allReviewed ? 'bg-accent-green/5' : 'bg-background-tertiary/60'}`}>
        <div className={`w-2 h-2 rounded-full shrink-0 ${
          allReviewed ? 'bg-accent-green' : reviewedCount > 0 ? 'bg-accent-amber' : 'bg-gray-600'
        }`} />
        <span className="font-bold mono text-sm">{asset}</span>
        <span className="text-xs text-gray-500">
          {hasMany
            ? `${deposits.length} entradas · ${totalAmt.toLocaleString('es-ES', { maximumFractionDigits: 6 })}`
            : `${totalAmt.toLocaleString('es-ES', { maximumFractionDigits: 6 })} · ${
                new Date(deposits[0].timestamp).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })
              }`
          }
        </span>
        <div className="flex-1" />

        {hasMany && (
          <div className="flex items-center gap-1.5">
            <HistoricalPriceButton asset={asset} timestamp={deposits[0].timestamp} onPrice={applyAll} label="Hist. a todos" />
            <button onClick={() => applyAll(0)}
              className="text-[10px] px-2 py-1 rounded-md border border-border text-gray-500 hover:text-white hover:border-gray-500 bg-background-card transition-colors">
              Gratis a todos
            </button>
            <button onClick={() => applyAll(null)}
              className="text-[10px] px-2 py-1 rounded-md border border-border text-gray-500 hover:text-white hover:border-gray-500 bg-background-card transition-colors">
              No sé a todos
            </button>
          </div>
        )}

        {hasMany && (
          <button onClick={() => setExpanded(e => !e)} className="text-gray-500 hover:text-gray-300 transition-colors ml-1">
            <span className={`text-gray-500 text-xs transition-transform inline-block ${expanded ? 'rotate-90' : ''}`}>▶</span>
          </button>
        )}

        {allReviewed && (
          <span className="text-[10px] text-accent-green flex items-center gap-0.5">
            <Check size={9} /> listo
          </span>
        )}
      </div>

      {expanded && (
        <div className="divide-y divide-border/50">
          {deposits.map(dep => (
            <DepositRow
              key={dep.txKey}
              dep={dep}
              cost={depositCosts[dep.txKey]}
              reviewed={dep.txKey in depositCosts}
              onSetCost={onSetCost}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// Panel de sección de depósitos agrupados por activo
export function DepositSection({ deposits, depositCosts, onSetCost, allReviewed, reviewedCount }: {
  deposits: DepositReview[]
  depositCosts: Record<string, number | null>
  onSetCost: (txKey: string, price: number | null) => void
  allReviewed: boolean
  reviewedCount: number
}) {
  const byAsset: Record<string, DepositReview[]> = {}
  for (const dep of deposits) {
    if (!byAsset[dep.asset]) byAsset[dep.asset] = []
    byAsset[dep.asset].push(dep)
  }

  return (
    <div className="border-t border-border pt-4 space-y-2">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className={`text-sm font-semibold ${allReviewed ? 'text-accent-green' : 'text-accent-amber'}`}>
            {allReviewed ? '✓ Depósitos revisados' : 'Depósitos externos — coste de adquisición'}
          </span>
          <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${
            allReviewed ? 'bg-accent-green/20 text-accent-green' : 'bg-accent-amber/20 text-accent-amber'
          }`}>
            {reviewedCount}/{deposits.length}
          </span>
        </div>
        <p className="text-[11px] text-gray-600">Activos recibidos desde fuera de Binance</p>
      </div>

      {Object.entries(byAsset).map(([asset, deps]) => (
        <DepositAssetGroup
          key={asset}
          asset={asset}
          deposits={deps}
          depositCosts={depositCosts}
          onSetCost={onSetCost}
        />
      ))}
    </div>
  )
}

// Panel compacto de revisión (en PreviewStage)
export function DepositCostReview({ deposits, costs, onSetCost }: {
  deposits: DepositReview[]
  costs: Record<string, number | null>
  onSetCost: (txKey: string, pricePerUnit: number | null) => void
}) {
  const reviewed = deposits.filter(d => d.txKey in costs).length
  const total    = deposits.length
  const allDone  = reviewed === total

  return (
    <div className={`card border-2 ${allDone ? 'border-accent-green/30' : 'border-accent-amber/40'} space-y-4`}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <AlertTriangle size={16} className={`shrink-0 mt-0.5 ${allDone ? 'text-accent-green' : 'text-accent-amber'}`} />
          <div>
            <h3 className={`font-semibold text-sm ${allDone ? 'text-accent-green' : 'text-accent-amber'}`}>
              {allDone ? '✓ Depósitos revisados' : 'Asigna el coste de adquisición de cada depósito'}
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Estos activos llegaron desde fuera de Binance. Obligatorio antes de importar.
            </p>
          </div>
        </div>
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${
          allDone ? 'bg-accent-green/20 text-accent-green' : 'bg-accent-amber/20 text-accent-amber'
        }`}>
          {reviewed}/{total}
        </span>
      </div>

      <div className="space-y-2">
        {deposits.map(dep => (
          <DepositRow
            key={dep.txKey}
            dep={dep}
            cost={costs[dep.txKey]}
            reviewed={dep.txKey in costs}
            onSetCost={onSetCost}
          />
        ))}
      </div>
    </div>
  )
}

// Stage dedicada para revisión de depósitos (imposible saltarse)
export function DepositReviewStage({ transactions, depositCosts, onSetCost, onConfirm, onBack }: {
  transactions: PreviewTransaction[]
  depositCosts: Record<string, number | null>
  onSetCost: (txKey: string, price: number | null) => void
  onConfirm: () => void
  onBack: () => void
}) {
  const deposits: DepositReview[] = transactions
    .filter(tx => (tx.notes ?? '').includes('cripto externo'))
    .map(tx => ({
      txKey:           tx.rawRowHashes?.[0] ?? `${tx.timestamp}|${tx.asset}|${tx.amount}`,
      timestamp:       tx.timestamp,
      asset:           tx.asset,
      amount:          tx.amount,
      historicalPrice: null,
    }))

  const reviewed    = deposits.filter(d => d.txKey in depositCosts).length
  const allReviewed = reviewed === deposits.length

  return (
    <div className="card space-y-5">
      <div className="flex items-start gap-3 pb-4 border-b border-border">
        <div className="w-9 h-9 rounded-xl bg-accent-amber/15 flex items-center justify-center shrink-0">
          <AlertTriangle size={18} className="text-accent-amber" />
        </div>
        <div className="flex-1">
          <h2 className="font-semibold text-base text-white">Revisión de depósitos externos</h2>
          <p className="text-xs text-gray-400 mt-1 leading-relaxed">
            {deposits.length} depósito{deposits.length > 1 ? 's' : ''} recibido{deposits.length > 1 ? 's' : ''} desde fuera de Binance.
            Indica el precio al que los compraste para que el cálculo FIFO y tu declaración fiscal sean correctos.
          </p>
        </div>
        <div className="shrink-0 text-right">
          <span className={`text-sm font-bold mono ${allReviewed ? 'text-accent-green' : 'text-accent-amber'}`}>
            {reviewed}/{deposits.length}
          </span>
          <p className="text-[10px] text-gray-600 mt-0.5">revisados</p>
        </div>
      </div>

      <div className="space-y-3">
        {deposits.map(dep => (
          <DepositRow
            key={dep.txKey}
            dep={dep}
            cost={depositCosts[dep.txKey]}
            reviewed={dep.txKey in depositCosts}
            onSetCost={onSetCost}
          />
        ))}
      </div>

      <div className="flex items-center justify-between pt-4 border-t border-border">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors"
        >
          <ChevronRight size={14} className="rotate-180" />
          Volver al preview
        </button>
        <button
          onClick={onConfirm}
          disabled={!allReviewed}
          className="flex items-center gap-2 px-6 py-2.5 bg-accent-blue hover:bg-accent-blue/80 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg text-sm font-medium transition-colors"
        >
          <Play size={14} />
          {allReviewed ? 'Confirmar e importar' : `Faltan ${deposits.length - reviewed} por revisar`}
        </button>
      </div>
    </div>
  )
}
