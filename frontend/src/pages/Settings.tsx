import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { portfolioApi } from '../api/portfolio'
import { Plus, HardDrive, ArrowRight, X } from 'lucide-react'
import { WalletsSection } from './settings/WalletsSection'
import { AssetsSection } from './settings/AssetsSection'
import { FiscalSection } from './settings/FiscalSection'
import { DatosSection } from './settings/DatosSection'
import { GeneralSection } from './settings/GeneralSection'

const SETUP_KEY = 'cflio_setup_seen'

function useSetup() {
  const [seen, setSeen] = useState(() => localStorage.getItem(SETUP_KEY) === 'true')
  function markSeen() { localStorage.setItem(SETUP_KEY, 'true'); setSeen(true) }
  return { setupSeen: seen, markSetupSeen: markSeen }
}

interface WalletData { id: string; is_system: boolean }

function SetupBanner({ onDismiss, onAddWallet }: { onDismiss: () => void; onAddWallet: () => void }) {
  return (
    <div className="card border border-accent-blue/30 bg-accent-blue/5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className="p-2.5 bg-accent-blue/10 rounded-lg shrink-0">
            <HardDrive size={20} className="text-accent-blue" />
          </div>
          <div>
            <h3 className="font-medium text-sm">Configura tus wallets antes de importar</h3>
            <p className="text-xs text-gray-400 mt-1 leading-relaxed">
              Si tienes wallets frías (Tangem, Ledger, Trezor...) añádelas aquí para que
              los retiros de Binance se asignen correctamente. Si solo operas en Binance
              no necesitas hacer nada más.
            </p>
            <div className="flex items-center gap-3 mt-4">
              <button onClick={onAddWallet}
                className="flex items-center gap-2 px-4 py-2 bg-accent-blue hover:bg-accent-blue/80 rounded-lg text-sm font-medium transition-colors">
                <Plus size={14} /> Añadir wallet fría
              </button>
              <button onClick={onDismiss}
                className="flex items-center gap-2 px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors">
                Solo uso Binance <ArrowRight size={14} />
              </button>
            </div>
          </div>
        </div>
        <button onClick={onDismiss} className="text-gray-600 hover:text-white transition-colors shrink-0 mt-0.5">
          <X size={16} />
        </button>
      </div>
    </div>
  )
}

function SettingsTabs({ active, onChange }: { active: string; onChange: (t: string) => void }) {
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
    <div className="flex gap-1 border-b border-border">
      {tabs.map(tab => (
        <button key={tab.id} onClick={() => onChange(tab.id)}
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

const VALID_TABS = ['wallets', 'assets', 'fiscal', 'datos', 'general']

export function Settings() {
  const { setupSeen, markSetupSeen } = useSetup()
  const [searchParams, setSearchParams] = useSearchParams()
  const tabParam = searchParams.get('tab')
  const [activeTab, setActiveTab] = useState(() =>
    tabParam && VALID_TABS.includes(tabParam) ? tabParam : 'wallets'
  )

  // Keep URL in sync when tab changes programmatically (e.g. via ?tab= link)
  useEffect(() => {
    if (tabParam && VALID_TABS.includes(tabParam) && tabParam !== activeTab) {
      setActiveTab(tabParam)
    }
  }, [tabParam])

  function handleTabChange(tab: string) {
    setActiveTab(tab)
    setSearchParams({ tab }, { replace: true })
  }

  const { data: wallets = [], isFetched: walletsFetched } = useQuery<WalletData[]>({
    queryKey: ['wallets'],
    queryFn: () => fetch('/api/wallets').then(r => r.json()),
  })

  // Auto-dismiss banner once wallets data arrives and user already has a non-system wallet
  useEffect(() => {
    if (walletsFetched && !setupSeen && wallets.some(w => !w.is_system)) {
      markSetupSeen()
    }
  }, [walletsFetched, wallets, setupSeen, markSetupSeen])

  // Don't show banner until we know the wallet state (avoids flash on first load)
  const showBanner = walletsFetched && !setupSeen && activeTab === 'wallets'

  return (
    <div className="flex flex-col h-full max-w-5xl mx-auto">
      <div className="px-6 pt-6 pb-0 space-y-4 shrink-0">
        <h1 className="text-2xl font-semibold">Configuración</h1>

        {showBanner && (
          <SetupBanner
            onDismiss={markSetupSeen}
            onAddWallet={markSetupSeen}
          />
        )}

        <SettingsTabs active={activeTab} onChange={handleTabChange} />
      </div>

      <div className="flex-1 overflow-hidden">
        {activeTab === 'wallets' && (
          <div className="h-full overflow-y-auto px-6 py-6">
            <WalletsSection onWalletCreated={markSetupSeen} />
          </div>
        )}
        {activeTab === 'assets'  && <AssetsSection />}
        {activeTab === 'fiscal'  && (
          <div className="h-full overflow-y-auto px-6 py-6">
            <FiscalSection />
          </div>
        )}
        {activeTab === 'datos'   && (
          <div className="h-full overflow-y-auto px-6 py-6">
            <DatosSection />
          </div>
        )}
        {activeTab === 'general' && (
          <div className="h-full overflow-y-auto px-6 py-6">
            <GeneralSection onNavigate={handleTabChange} />
          </div>
        )}
      </div>
    </div>
  )
}
