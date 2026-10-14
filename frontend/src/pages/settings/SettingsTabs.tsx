import { useQuery } from '@tanstack/react-query'
import { portfolioApi } from '../../api/portfolio'

export function SettingsTabs({ active, onChange }: { active: string; onChange: (t: string) => void }) {
  const { data: assets = [] } = useQuery({ queryKey: ['assets'], queryFn: portfolioApi.getAssets })
  const unknownCount = assets.filter(a => !a.is_stablecoin && a.price_source === 'unknown').length

  const tabs: { id: string; label: string; badge?: number }[] = [
    { id: 'wallets', label: 'Wallets' },
    { id: 'assets',  label: 'Activos', badge: unknownCount },
    { id: 'fiscal',  label: 'Fiscal' },
    { id: 'datos',   label: 'Datos' },
    { id: 'general', label: 'General' },
  ]

  return (
    <div className="flex gap-1 border-b border-border" role="tablist">
      {tabs.map(tab => (
        <button key={tab.id} type="button" onClick={() => onChange(tab.id)}
          role="tab" aria-selected={active === tab.id}
          className={`flex items-center gap-2 px-5 py-3 text-sm font-medium transition-all border-b-2 -mb-px ${
            active === tab.id
              ? 'text-fg border-brand'
              : 'text-fg-subtle border-transparent hover:text-fg hover:border-border'
          }`}>
          {tab.label}
          {(tab.badge ?? 0) > 0 && (
            <span className="text-xs px-1.5 py-0.5 rounded-full bg-negative/15 text-negative font-semibold">
              {tab.badge}
            </span>
          )}
        </button>
      ))}
    </div>
  )
}
