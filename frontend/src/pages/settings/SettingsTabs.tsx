import { useQuery } from '@tanstack/react-query'
import { portfolioApi } from '../../api/portfolio'

export const VALID_TABS = ['wallets', 'assets', 'fiscal', 'datos', 'general']

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
              ? 'text-white border-accent-blue'
              : 'text-gray-500 border-transparent hover:text-gray-300 hover:border-gray-600'
          }`}>
          {tab.label}
          {(tab.badge ?? 0) > 0 && (
            <span className="text-xs px-1.5 py-0.5 rounded-full bg-accent-red/15 text-accent-red font-semibold">
              {tab.badge}
            </span>
          )}
        </button>
      ))}
    </div>
  )
}
