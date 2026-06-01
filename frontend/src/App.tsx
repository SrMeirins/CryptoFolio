import { useState, useRef, useEffect } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
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
import { Bell, X, AlertTriangle, AlertCircle, Info } from 'lucide-react'

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

// ── NotificationsButton ────────────────────────────────────────────────────
function NotificationsButton() {
  const [open, setOpen] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)

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
                  return (
                    <div key={n.id} className="flex gap-3 px-4 py-3.5" style={{ backgroundColor: `${color}08` }}>
                      <Icon size={15} className="shrink-0 mt-0.5" style={{ color }} />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-semibold" style={{ color }}>{n.category}</span>
                          <span className="text-xs px-1.5 py-0.5 rounded-md" style={{ backgroundColor: `${color}20`, color }}>
                            {label}
                          </span>
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
    <div className="shrink-0 h-12 flex items-center justify-end px-4 border-b border-border bg-background-secondary">
      <NotificationsButton />
    </div>
  )
}

// ── App ────────────────────────────────────────────────────────────────────
export default function App() {
  useLivePrices()

  return (
    <BrowserRouter>
      <div className="flex h-screen overflow-hidden">
        <Sidebar />
        <div className="flex-1 flex flex-col overflow-hidden bg-background-primary">
          <TopBar />
          <main className="flex-1 overflow-y-auto">
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/portfolio" element={<Portfolio />} />
              <Route path="/fiscal" element={<Fiscal />} />
              <Route path="/import" element={<ImportPage />} />
              <Route path="/history" element={<History />} />
              <Route path="/settings" element={<Settings />} />
            </Routes>
          </main>
        </div>
      </div>
    </BrowserRouter>
  )
}
