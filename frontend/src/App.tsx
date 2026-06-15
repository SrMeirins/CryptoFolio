import { useState, useRef, useEffect } from 'react'
import { BrowserRouter, Routes, Route, useNavigate, useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Sidebar } from './components/Sidebar'
import { Dashboard } from './pages/Dashboard'
import { Portfolio } from './pages/Portfolio'
import { Fiscal } from './pages/Fiscal'
import { ImportPage } from './pages/Import'
import { History } from './pages/History'
import { Settings } from './pages/Settings'
import { useLivePrices } from './hooks/useLivePrices'
import { portfolioApi } from './api/portfolio'
import { Bell, X, AlertTriangle, AlertCircle, Info, RefreshCw, Download, ArrowUpCircle } from 'lucide-react'
import { usePricesStore } from './store/pricesStore'
import { ToastProvider } from './components/Toast'

// ── Tipos ──────────────────────────────────────────────────────────────────
interface Notification {
  id: string
  type: 'error' | 'warning' | 'info'
  category: string
  message: string
  count?: number
}

const TYPE_META = {
  error:   { Icon: AlertCircle,   color: '#e74c3c', label: 'Error' },
  warning: { Icon: AlertTriangle, color: '#f59e0b', label: 'Aviso' },
  info:    { Icon: Info,          color: '#6366f1', label: 'Info'  },
}

const NOTIFICATION_ROUTES: Record<string, string> = {
  'no-price':             '/settings?tab=assets',
  'lots-no-price':        '/settings?tab=assets',
  'pending-withdrawals':  '/history',
  'crypto-deposits':      '/import',
}

// ── UpdateBanner ───────────────────────────────────────────────────────────
function UpdateBanner() {
  const bridge = window.__CRYPTOFOLIO__
  const [state, setState] = useState<{
    available: boolean
    downloaded: boolean
    version: string | null
    installing: boolean
  }>({ available: false, downloaded: false, version: null, installing: false })

  useEffect(() => {
    if (!bridge) return

    bridge.getUpdateStatus().then(s =>
      setState(prev => ({ ...prev, available: s.available, downloaded: s.downloaded, version: s.version }))
    )

    bridge.onUpdateAvailable(info =>
      setState(prev => ({ ...prev, available: true, version: info.version }))
    )

    bridge.onUpdateDownloaded(info =>
      setState(prev => ({ ...prev, downloaded: true, version: info.version }))
    )
  }, [bridge])

  if (!state.available) return null

  async function handleUpdate() {
    if (state.installing) return
    setState(prev => ({ ...prev, installing: true }))
    try {
      await bridge?.downloadAndInstall()
    } catch {
      setState(prev => ({ ...prev, installing: false }))
    }
  }

  return (
    <div className="shrink-0 flex items-center justify-between gap-3 px-4 py-2 bg-accent-blue/10 border-b border-accent-blue/20">
      <div className="flex items-center gap-2 text-xs text-accent-blue">
        <ArrowUpCircle size={14} className="shrink-0" />
        <span>
          {state.downloaded
            ? `Versión ${state.version} lista para instalar — reinicia la aplicación`
            : `Nueva versión ${state.version} disponible — descargando en segundo plano...`
          }
        </span>
      </div>
      <button
        onClick={handleUpdate}
        disabled={state.installing}
        className="shrink-0 flex items-center gap-1.5 px-3 py-1 rounded-lg bg-accent-blue hover:bg-accent-blue/80 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-medium transition-colors"
      >
        {state.installing
          ? <><RefreshCw size={12} className="animate-spin" /> Instalando...</>
          : state.downloaded
          ? <><Download size={12} /> Reiniciar y actualizar</>
          : <><Download size={12} /> Actualizar ahora</>
        }
      </button>
    </div>
  )
}

// ── PriceRefreshButton ─────────────────────────────────────────────────────
function PriceRefreshButton() {
  const { connected, lastUpdate, setPrices } = usePricesStore(s => ({
    connected:  s.connected,
    lastUpdate: s.lastUpdate,
    setPrices:  s.setPrices,
  }))
  const [refreshing, setRefreshing] = useState(false)
  const [done,       setDone]       = useState(false)

  async function refresh() {
    if (refreshing) return
    setRefreshing(true)
    setDone(false)
    try {
      const data: Record<string, number> = await fetch('/api/prices/live').then(r => r.json())
      if (Object.keys(data).length > 0) setPrices(data)
      setDone(true)
      setTimeout(() => setDone(false), 1500)
    } catch { /* silencioso */ } finally {
      setRefreshing(false)
    }
  }

  const timeAgo = lastUpdate
    ? (() => {
        const secs = Math.floor((Date.now() - lastUpdate.getTime()) / 1000)
        if (secs < 60)  return `${secs}s`
        if (secs < 3600) return `${Math.floor(secs / 60)}m`
        return `${Math.floor(secs / 3600)}h`
      })()
    : null

  const title = connected
    ? `Precios en vivo · actualizado hace ${timeAgo ?? '…'}`
    : 'Sin conexión · haz clic para refrescar'

  return (
    <button
      onClick={refresh}
      title={title}
      className={`relative flex items-center gap-1.5 px-2 py-1.5 rounded-lg transition-all text-xs ${
        refreshing
          ? 'text-accent-blue bg-accent-blue/10'
          : done
          ? 'text-accent-green bg-accent-green/10'
          : 'text-gray-500 hover:text-white hover:bg-background-tertiary'
      }`}
    >
      <RefreshCw
        size={14}
        className={refreshing ? 'animate-spin' : 'transition-transform hover:rotate-180 duration-300'}
      />
      {/* Indicador de estado WS */}
      <span
        className={`w-1.5 h-1.5 rounded-full shrink-0 ${
          connected ? 'bg-accent-green animate-pulse' : 'bg-gray-600'
        }`}
      />
    </button>
  )
}

// ── NotificationsButton ────────────────────────────────────────────────────
function NotificationsButton() {
  const [open, setOpen] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()

  const { data: notifications = [] } = useQuery<Notification[]>({
    queryKey: ['notifications'],
    queryFn: portfolioApi.getNotifications,
    refetchInterval: 60_000,
  })

  const errorCount   = notifications.filter(n => n.type === 'error').length
  const warningCount = notifications.filter(n => n.type === 'warning').length
  const totalCount   = notifications.length
  const badgeColor   = errorCount > 0 ? '#e74c3c' : warningCount > 0 ? '#f59e0b' : '#6366f1'

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [open])

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => setOpen(o => !o)}
        className={`relative p-2 rounded-lg transition-colors ${
          open ? 'bg-background-tertiary text-white' : 'text-gray-500 hover:text-white hover:bg-background-tertiary'
        }`}
        title="Avisos del sistema"
      >
        <Bell size={18} />
        {totalCount > 0 && (
          <span
            className="absolute -top-0.5 -right-0.5 min-w-4 h-4 px-0.5 rounded-full text-white flex items-center justify-center font-bold"
            style={{ backgroundColor: badgeColor, fontSize: '10px' }}
          >
            {totalCount > 9 ? '9+' : totalCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute top-full right-0 mt-2 w-96 rounded-xl border border-border bg-background-card shadow-2xl z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <span className="text-sm font-semibold">Avisos del sistema</span>
            <button onClick={() => setOpen(false)} className="text-gray-600 hover:text-white transition-colors">
              <X size={14} />
            </button>
          </div>
          <div className="max-h-[480px] overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-8 text-center">
                <Bell size={20} className="text-gray-700" />
                <p className="text-xs text-gray-600">Sin avisos. Todo en orden.</p>
              </div>
            ) : (
              <div className="divide-y divide-border/50">
                {notifications.map(n => {
                  const { Icon, color, label } = TYPE_META[n.type]
                  const dest = NOTIFICATION_ROUTES[n.id]
                  return (
                    <div key={n.id}
                      onClick={dest ? () => { navigate(dest); setOpen(false) } : undefined}
                      className={`flex gap-3 px-4 py-3.5 transition-colors ${dest ? 'cursor-pointer hover:brightness-110' : ''}`}
                      style={{ backgroundColor: `${color}08` }}>
                      <Icon size={15} className="shrink-0 mt-0.5" style={{ color }} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-semibold" style={{ color }}>{n.category}</span>
                          <span className="text-xs px-1.5 py-0.5 rounded-md" style={{ backgroundColor: `${color}20`, color }}>
                            {label}
                          </span>
                          {dest && (
                            <span className="ml-auto text-xs text-gray-600 group-hover:text-gray-400">Ir →</span>
                          )}
                        </div>
                        <p className="text-xs text-gray-300 leading-relaxed">{n.message}</p>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── TopBar ─────────────────────────────────────────────────────────────────
function TopBar() {
  return (
    <div className="shrink-0 h-12 flex items-center justify-end gap-1 px-4 border-b border-border bg-background-secondary">
      <PriceRefreshButton />
      <NotificationsButton />
    </div>
  )
}

// ── RoutedContent ──────────────────────────────────────────────────────────
function RoutedContent() {
  const { pathname } = useLocation()
  return (
    <div key={pathname} className="animate-page-in min-h-full">
      <Routes>
        <Route path="/"         element={<Dashboard />} />
        <Route path="/portfolio" element={<Portfolio />} />
        <Route path="/fiscal"   element={<Fiscal />} />
        <Route path="/import"   element={<ImportPage />} />
        <Route path="/history"  element={<History />} />
        <Route path="/settings" element={<Settings />} />
      </Routes>
    </div>
  )
}

// ── App ────────────────────────────────────────────────────────────────────
export default function App() {
  useLivePrices()

  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <ToastProvider>
      <div className="flex h-screen overflow-hidden">
        <Sidebar />
        <div className="flex-1 flex flex-col overflow-hidden bg-background-primary">
          <UpdateBanner />
          <TopBar />
          <main className="flex-1 overflow-y-auto">
            <RoutedContent />
          </main>
        </div>
      </div>
      </ToastProvider>
    </BrowserRouter>
  )
}
