import { useQuery } from '@tanstack/react-query'
import { portfolioApi } from '../../api/portfolio'
import { Badge, Tabs } from '../../components/ui'

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
    <Tabs label="Secciones de configuración" idBase="settings" variant="underline" value={active} onChange={onChange}
      items={tabs.map(tab => ({
        value: tab.id,
        label: (
          <span className="flex items-center gap-2">
            {tab.label}
            {(tab.badge ?? 0) > 0 && <Badge tone="negative">{tab.badge}</Badge>}
          </span>
        ),
      }))} />
  )
}
