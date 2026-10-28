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
import { SettingsNav } from './settings/SettingsNav'
import { VALID_TABS } from './settings/validTabs'
import { useSetupSeen } from '../hooks/useSetupSeen'
import { tabId, tabPanelId, PageHeader } from '../components/ui'
import { navIcon } from '../constants/navigation'

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

  // Cada sección con su desplazamiento propio; Activos gestiona el suyo (cabecera fija).
  const scroll = 'h-full overflow-y-auto pb-6 pr-1'

  return (
    <div className="flex flex-col h-full max-w-6xl mx-auto">
      <div className="px-6 pt-6 pb-0 space-y-4 shrink-0">
        <PageHeader icon={navIcon('/settings')} title="Ajustes" subtitle="Wallets, activos, fiscalidad y datos" />

        {showBanner && (
          <SetupBanner
            onDismiss={markSetupSeen}
            onAddWallet={markSetupSeen}
          />
        )}
      </div>

      {/* Menú lateral y contenido (#445); en pantallas estrechas, menú arriba. */}
      <div className="flex-1 min-h-0 flex flex-col lg:flex-row gap-4 lg:gap-8 px-6 pt-5">
        <div className="shrink-0 lg:w-60">
          <SettingsNav active={activeTab} onChange={handleTabChange} />
        </div>
        <div className="flex-1 min-w-0 min-h-0 overflow-hidden" id={tabPanelId('settings')} role="tabpanel" aria-labelledby={tabId('settings', activeTab)}>
          {/* La clave remonta el contenido para la entrada suave al cambiar de sección. */}
          <div key={activeTab} className="settings-section-in h-full">
            {activeTab === 'wallets' && <div className={scroll}><WalletsSection onWalletCreated={markSetupSeen} /></div>}
            {activeTab === 'assets'  && <AssetsSection />}
            {activeTab === 'fiscal'  && <div className={scroll}><FiscalSection /></div>}
            {activeTab === 'datos'   && <div className={scroll}><DatosSection /></div>}
            {activeTab === 'general' && <div className={scroll}><GeneralSection onNavigate={handleTabChange} /></div>}
          </div>
        </div>
      </div>
    </div>
  )
}
