import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { portfolioApi } from '../api/portfolio'
import { WalletsSection } from './settings/WalletsSection'
import { AssetsSection } from './settings/AssetsSection'
import { FiscalSection } from './settings/FiscalSection'
import { DatosSection } from './settings/DatosSection'
import { GeneralSection } from './settings/GeneralSection'
import { SetupBanner } from './settings/SetupBanner'
import { SettingsTabs } from './settings/SettingsTabs'
import { VALID_TABS } from './settings/validTabs'
import { useSetupSeen } from '../hooks/useSetupSeen'

export function Settings() {
  const { setupSeen, markSetupSeen } = useSetupSeen()
  const [searchParams, setSearchParams] = useSearchParams()
  const tabParam = searchParams.get('tab')
  // La pestaña activa se deriva de la URL (?tab=), que es la única fuente de
  // verdad: así los enlaces profundos y el botón atrás funcionan sin duplicar estado.
  const activeTab = tabParam && VALID_TABS.includes(tabParam) ? tabParam : 'wallets'

  function handleTabChange(tab: string) {
    setSearchParams({ tab }, { replace: true })
  }

  const { data: wallets = [], isFetched: walletsFetched } = useQuery({
    queryKey: ['wallets'],
    queryFn: portfolioApi.getWallets,
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
