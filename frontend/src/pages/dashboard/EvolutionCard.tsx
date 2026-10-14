import { useId, useState } from 'react'
import { PnlChart } from './PnlChart'
import { PortfolioHistoryChart } from './PortfolioHistoryChart'
import { Tabs, tabId, tabPanelId } from '../../components/ui'

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

  const tabs = (
    <div className="flex items-center gap-2">
      <span className="text-[11px] text-fg-subtle font-medium uppercase tracking-widest">Evolución</span>
      <Tabs label="Evolución del portfolio" idBase={baseId} value={tab} onChange={setTab}
        items={TABS.map(t => ({ value: t.id, label: t.label }))} />
    </div>
  )

  return (
    <div id={tabPanelId(baseId)} role="tabpanel" aria-labelledby={tabId(baseId, tab)}>
      {tab === 'pnl'
        ? <PnlChart headerLeft={tabs} />
        : <PortfolioHistoryChart currentValue={currentValue} headerLeft={tabs} />}
    </div>
  )
}
