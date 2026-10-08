import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Bell, X, RefreshCw } from 'lucide-react'
import { usePricesStore } from '../store/pricesStore'
import { portfolioApi, type Notification } from '../api/portfolio'
import { NOTIFICATION_ROUTES, NOTIFICATION_TYPE_META } from '../constants/notifications'
import { useClickOutside } from '../hooks/useClickOutside'
import { useNow } from '../hooks/useNow'

function PriceRefreshButton() {
  const { connected, lastUpdate, setPrices } = usePricesStore(s => ({
    connected:  s.connected,
    lastUpdate: s.lastUpdate,
    setPrices:  s.setPrices,
  }))
  const [refreshing, setRefreshing] = useState(false)
  const [done,       setDone]       = useState(false)
  const now = useNow()

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
        const secs = Math.max(0, Math.floor((now - lastUpdate.getTime()) / 1000))
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
      type="button"
      onClick={refresh}
      title={title}
      aria-label={title}
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

function NotificationsButton() {
  const [open, setOpen] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()

  useClickOutside(panelRef, () => setOpen(false), open)

  const { data: notifications = [] } = useQuery<Notification[]>({
    queryKey: ['notifications'],
    queryFn: portfolioApi.getNotifications,
    refetchInterval: 60_000,
  })

  const errorCount   = notifications.filter(n => n.type === 'error').length
  const warningCount = notifications.filter(n => n.type === 'warning').length
  const totalCount   = notifications.length
  const badgeColor   = errorCount > 0 ? '#e74c3c' : warningCount > 0 ? '#f59e0b' : '#6366f1'

  return (
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
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
            <button type="button" onClick={() => setOpen(false)} aria-label="Cerrar avisos" className="text-gray-600 hover:text-white transition-colors">
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
                  const { icon: Icon, color, label } = NOTIFICATION_TYPE_META[n.type]
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

export function TopBar() {
  return (
    <div className="shrink-0 h-12 flex items-center justify-end gap-1 px-4 border-b border-border bg-background-secondary">
      <PriceRefreshButton />
      <NotificationsButton />
    </div>
  )
}
