import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useLocation, useNavigate } from 'react-router-dom'
import { portfolioApi } from '../api/portfolio'
import { usePrivacyStore } from '../store/privacyStore'
import { privacyOnStart, startPage } from '../utils/preferences'

// Preferencias al abrir la app (#446): modo privacidad y página de inicio. Se
// aplican una sola vez por carga, en cuanto llega la configuración: navegar
// después al Dashboard desde el menú no redirige.
let applied = false

export function useStartupPreferences(): void {
  const { data: config } = useQuery({ queryKey: ['config'], queryFn: portfolioApi.getConfig })
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const setHidden = usePrivacyStore(s => s.setHidden)

  useEffect(() => {
    if (applied || !config) return
    applied = true
    if (privacyOnStart(config)) setHidden(true)
    // Solo si se entra por la raíz: un enlace directo a otra página se respeta.
    const page = startPage(config)
    if (pathname === '/' && page !== '/') navigate(page, { replace: true })
  }, [config, pathname, navigate, setHidden])
}
