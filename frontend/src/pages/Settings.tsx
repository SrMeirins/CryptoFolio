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
import { tabId, tabPanelId, PageHeader, SectionHeader } from '../components/ui'
import { navIcon } from '../constants/navigation'

// Título y contexto de las secciones sin cabecera propia (#491).
const SECTION_HEADERS = {
  fiscal: { title: 'Fiscal', subtitle: 'Normativa, Modelo 721, tramos del IRPF y comisión de red.' },
  datos: { title: 'Datos', subtitle: 'Copias de seguridad, mantenimiento y borrado de datos.' },
  general: { title: 'General', subtitle: 'Tema, zona horaria, moneda, preferencias y avisos.' },
} as const

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

  // consulta de fondo (#498): solo decide si se muestra el aviso de primer uso; si falla, no se muestra.
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
            {/* Cabecera común de sección (#491): un h2 por pestaña. Wallets y Activos llevan la suya con acciones. */}
            {activeTab === 'fiscal'  && <div className={scroll}><SectionHeader className="mb-4" {...SECTION_HEADERS.fiscal} /><FiscalSection /></div>}
            {activeTab === 'datos'   && <div className={scroll}><SectionHeader className="mb-4" {...SECTION_HEADERS.datos} /><DatosSection /></div>}
            {activeTab === 'general' && <div className={scroll}><SectionHeader className="mb-4" {...SECTION_HEADERS.general} /><GeneralSection /></div>}
          </div>
        </div>
      </div>
    </div>
  )
}
