import { useQuery } from '@tanstack/react-query'
import { Wallet, Coins, Landmark, Database, SlidersHorizontal, type LucideIcon } from 'lucide-react'
import { portfolioApi } from '../../api/portfolio'
import { Badge, SectionNav } from '../../components/ui'
import { VALID_TABS } from './validTabs'

// Menú de Ajustes (#445): secciones de nivel 1 con el SectionNav común (#492),
// con un dato corto por sección y el recuento de activos sin precio.

type Section = typeof VALID_TABS[number]

const META: Record<Section, { label: string; icon: LucideIcon; hint: string }> = {
  wallets: { label: 'Wallets', icon: Wallet, hint: 'Wallets y direcciones' },
  assets:  { label: 'Activos', icon: Coins, hint: 'Pares y precios' },
  fiscal:  { label: 'Fiscal', icon: Landmark, hint: 'Modelo 721 y tramos IRPF' },
  datos:   { label: 'Datos', icon: Database, hint: 'Copias y mantenimiento' },
  general: { label: 'General', icon: SlidersHorizontal, hint: 'Tema, zona y moneda' },
}

export function SettingsNav({ active, onChange }: { active: Section; onChange: (s: Section) => void }) {
  const { data: assets = [] } = useQuery({ queryKey: ['assets'], queryFn: portfolioApi.getAssets })
  const { data: wallets = [] } = useQuery({ queryKey: ['wallets'], queryFn: portfolioApi.getWallets })
  const unknown = assets.filter(a => !a.is_stablecoin && a.price_source === 'unknown').length
  const userWallets = wallets.filter(w => !w.is_system).length
  const hint = (s: Section) =>
    s === 'wallets' && userWallets > 0 ? `${userWallets} ${userWallets === 1 ? 'wallet' : 'wallets'}`
    : s === 'assets' && assets.length > 0 ? `${assets.length} activos`
    : META[s].hint

  return (
    <SectionNav label="Secciones de Ajustes" idBase="settings" value={active} onChange={onChange}
      items={VALID_TABS.map(s => ({
        value: s, label: META[s].label, icon: META[s].icon, hint: hint(s),
        badge: s === 'assets' && unknown > 0 ? <Badge tone="negative">{unknown}<span className="sr-only"> sin precio</span></Badge> : undefined,
      }))} />
  )
}
