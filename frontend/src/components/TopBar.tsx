import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Bell, X, RefreshCw } from 'lucide-react'
import { usePricesStore } from '../store/pricesStore'
import { portfolioApi, type Notification } from '../api/portfolio'
import { NOTIFICATION_ROUTES, NOTIFICATION_TYPE_META } from '../constants/notifications'
import { useClickOutside } from '../hooks/useClickOutside'
import { useNow } from '../hooks/useNow'
import { LIVE_STATUS_META, useLiveStatus } from '../hooks/useLiveStatus'
import { CurrencyToggle } from './CurrencyToggle'
import { ThemeToggle } from './ThemeToggle'
import { T, alpha } from '../utils/colors'
import { cardClasses, iconButtonClasses } from './ui'

function PriceRefreshButton() {
  const status = useLiveStatus()
  const { lastUpdate, setPrices } = usePricesStore(s => ({
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

  const title = status === 'live'
    ? `Precios en vivo · actualizado hace ${timeAgo ?? '…'}`
    : `${LIVE_STATUS_META[status].title} · haz clic para refrescar`

  return (
    <button
      type="button"
      onClick={refresh}
      title={title}
      aria-label={title}
      className={`relative flex items-center gap-1.5 px-2 py-1.5 rounded-lg transition-all text-xs ${
        refreshing
          ? 'text-brand bg-brand/10'
          : done
          ? 'text-positive bg-positive/10'
          : 'text-fg-subtle hover:text-fg hover:bg-background-tertiary'
      }`}
    >
      <RefreshCw
        size={14}
        className={refreshing ? 'animate-spin' : 'transition-transform hover:rotate-180 duration-300'}
      />
      {/* Indicador de estado: en vivo, sin actualizaciones o sin conexión (#194) */}
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${LIVE_STATUS_META[status].dot}`} />
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
  const badgeColor   = errorCount > 0 ? T.negative : warningCount > 0 ? T.warning : T.brand

  return (
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        className={`relative p-2 rounded-lg transition-colors ${
          open ? 'bg-background-tertiary text-fg' : 'text-fg-subtle hover:text-fg hover:bg-background-tertiary'
        }`}
        title="Avisos del sistema"
      >
        <Bell size={18} />
        {totalCount > 0 && (
          <span
            className="absolute -top-0.5 -right-0.5 min-w-4 h-4 px-0.5 rounded-full text-fg flex items-center justify-center font-bold"
            style={{ backgroundColor: badgeColor, fontSize: '10px' }}
          >
            {totalCount > 9 ? '9+' : totalCount}
          </span>
        )}
      </button>

      {open && (
        <div className={cardClasses('none', 'absolute top-full right-0 mt-2 w-96 shadow-2xl z-50 overflow-hidden')}>
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <span className="text-sm font-semibold">Avisos del sistema</span>
            <button type="button" onClick={() => setOpen(false)} aria-label="Cerrar avisos" className={iconButtonClasses('sm')}>
              <X size={14} />
            </button>
          </div>
          <div className="max-h-[480px] overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-8 text-center">
                <Bell size={20} className="text-fg-subtle" />
                <p className="text-xs text-fg-subtle">Sin avisos. Todo en orden.</p>
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
                      style={{ backgroundColor: `${alpha(color, 3)}` }}>
                      <Icon size={15} className="shrink-0 mt-0.5" style={{ color }} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-semibold" style={{ color }}>{n.category}</span>
                          <span className="text-xs px-1.5 py-0.5 rounded-lg" style={{ backgroundColor: `${alpha(color, 13)}`, color }}>
                            {label}
                          </span>
                          {dest && (
                            <span className="ml-auto text-xs text-fg-subtle group-hover:text-fg-muted">Ir →</span>
                          )}
                        </div>
                        <p className="text-xs text-fg leading-relaxed">{n.message}</p>
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
      <ThemeToggle />
      <div className="w-2" aria-hidden="true" />
      <CurrencyToggle />
      <div className="w-2" aria-hidden="true" />
      <PriceRefreshButton />
      <NotificationsButton />
    </div>
  )
}
