import { useId, useState } from 'react'
import { PnlChart } from './PnlChart'
import { PortfolioHistoryChart } from './PortfolioHistoryChart'

// Bloque de evolución del Dashboard (#166): pestaña P&L (rentabilidad
// acumulada, por defecto) y pestaña Valor (valor de mercado de la cartera).

type Tab = 'pnl' | 'value'

const TABS: { id: Tab; label: string }[] = [
  { id: 'pnl', label: 'P&L' },
  { id: 'value', label: 'Valor' },
]

export function EvolutionCard({ currentValue }: { currentValue?: number }) {
  const [tab, setTab] = useState<Tab>('pnl')
  const baseId = useId()

  // Teclado: flechas izquierda/derecha cambian de pestaña (patrón ARIA tabs).
  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
    e.preventDefault()
    const next = TABS[(TABS.findIndex(t => t.id === tab) + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length]
    setTab(next.id)
    document.getElementById(`${baseId}-tab-${next.id}`)?.focus()
  }

  const tabs = (
    <div role="tablist" aria-label="Evolución del portfolio" className="flex items-center gap-1" onKeyDown={onKeyDown}>
      <span className="text-[11px] text-fg-subtle font-medium uppercase tracking-widest mr-2">Evolución</span>
      {TABS.map(t => (
        <button
          key={t.id}
          id={`${baseId}-tab-${t.id}`}
          type="button"
          role="tab"
          aria-selected={tab === t.id}
          aria-controls={`${baseId}-panel`}
          tabIndex={tab === t.id ? 0 : -1}
          onClick={() => setTab(t.id)}
          className={`text-xs font-semibold px-2.5 py-1 rounded-lg transition-colors focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand/60 ${
            tab === t.id ? 'bg-brand/15 text-brand' : 'text-fg-subtle hover:text-fg'
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  )

  return (
    <div id={`${baseId}-panel`} role="tabpanel" aria-labelledby={`${baseId}-tab-${tab}`}>
      {tab === 'pnl'
        ? <PnlChart headerLeft={tabs} />
        : <PortfolioHistoryChart currentValue={currentValue} headerLeft={tabs} />}
    </div>
  )
}
