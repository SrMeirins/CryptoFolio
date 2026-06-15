import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { portfolioApi } from '../../api/portfolio'
import { AlertCircle, Bell, BellOff, X, ArrowRight, Wrench } from 'lucide-react'

const NOTIFICATION_ROUTES: Record<string, string> = {
  'no-price':            '/settings?tab=assets',
  'lots-no-price':       '/settings?tab=assets',
  'pending-withdrawals': '/history',
  'crypto-deposits':     '/import',
}

const NOTIFICATION_LABELS: Record<string, string> = {
  'no-price':            'Ir a Activos',
  'lots-no-price':       'Ir a Activos',
  'pending-withdrawals': 'Ir a Historial',
  'crypto-deposits':     'Ir a Importación',
}

const NOTIFICATION_TYPE_META: Record<string, { color: string; icon: typeof AlertCircle }> = {
  error:   { color: '#ef4444', icon: AlertCircle },
  warning: { color: '#f59e0b', icon: AlertCircle },
  info:    { color: '#6366f1', icon: Bell },
}

export function GeneralSection({ onNavigate }: { onNavigate?: (tab: string) => void }) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  function goTo(dest: string) {
    if (dest.startsWith('/settings?tab=')) {
      const tab = new URLSearchParams(dest.split('?')[1]).get('tab') ?? 'general'
      onNavigate?.(tab)
    } else {
      navigate(dest)
    }
  }

  const { data: notifications = [] } = useQuery({
    queryKey: ['notifications'],
    queryFn: portfolioApi.getNotifications,
    refetchInterval: 30000,
  })

  async function dismissAll() {
    // Mark all seen via config key
    await portfolioApi.setConfig('notifications_dismissed_at', new Date().toISOString())
    queryClient.invalidateQueries({ queryKey: ['notifications'] })
  }

  return (
    <div className="space-y-6 max-w-2xl">

      {/* Notificaciones */}
      <div className="rounded-xl border border-border bg-background-card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-sm">Notificaciones del sistema</h3>
            <p className="text-xs text-gray-500 mt-0.5">Alertas activas que requieren tu atención.</p>
          </div>
          {notifications.length > 0 && (
            <button onClick={dismissAll}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-500 hover:text-white bg-background-tertiary hover:bg-border border border-border rounded-lg transition-colors">
              <BellOff size={11} /> Descartar todas
            </button>
          )}
        </div>

        {notifications.length === 0 ? (
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-accent-green/8 border border-accent-green/20">
            <div className="w-7 h-7 rounded-full bg-accent-green/15 flex items-center justify-center shrink-0">
              <Bell size={13} className="text-accent-green" />
            </div>
            <p className="text-sm text-accent-green">Todo en orden — no hay notificaciones activas.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {notifications.map(n => {
              const meta = NOTIFICATION_TYPE_META[n.type] ?? NOTIFICATION_TYPE_META.info
              const Icon = meta.icon
              const dest = NOTIFICATION_ROUTES[n.id]
              const actionLabel = NOTIFICATION_LABELS[n.id]
              return (
                <div key={n.id} className="flex items-start gap-3 px-4 py-3 rounded-xl border"
                  style={{ borderColor: `${meta.color}30`, backgroundColor: `${meta.color}08` }}>
                  <Icon size={14} className="mt-0.5 shrink-0" style={{ color: meta.color }} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-medium capitalize" style={{ color: meta.color }}>{n.type}</span>
                      <span className="text-xs text-gray-600">{n.category}</span>
                      {n.count && n.count > 1 && (
                        <span className="text-xs px-1.5 py-0.5 rounded-full font-semibold"
                          style={{ backgroundColor: `${meta.color}20`, color: meta.color }}>
                          ×{n.count}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">{n.message}</p>
                    <div className="flex items-center gap-3 mt-2 flex-wrap">
                      {dest && (
                        <button onClick={() => goTo(dest)}
                          className="inline-flex items-center gap-1 text-xs font-medium transition-colors hover:opacity-80"
                          style={{ color: meta.color }}>
                          {actionLabel} <ArrowRight size={10} />
                        </button>
                      )}
                      {n.id === 'pending-withdrawals' && (
                        <button
                          onClick={async () => {
                            const r = await portfolioApi.fixStaleWithdrawals()
                            if (r.fixed > 0) queryClient.invalidateQueries({ queryKey: ['notifications'] })
                          }}
                          className="inline-flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-white transition-colors">
                          <Wrench size={10} /> Corregir auto ({n.count})
                        </button>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={async () => {
                      await portfolioApi.setConfig(`notification_dismissed_${n.id}`, new Date().toISOString())
                      queryClient.invalidateQueries({ queryKey: ['notifications'] })
                    }}
                    className="p-1 text-gray-600 hover:text-white transition-colors shrink-0">
                    <X size={12} />
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Acerca de */}
      <div className="rounded-xl border border-border bg-background-card p-5 space-y-3">
        <h3 className="font-semibold text-sm">Acerca de CryptoFolio</h3>
        <div className="space-y-2 text-xs text-gray-500">
          <div className="flex items-center justify-between">
            <span>Versión</span>
            <span className="mono text-gray-400">0.3.0-dev</span>
          </div>
          <div className="flex items-center justify-between">
            <span>Método fiscal</span>
            <span className="mono text-gray-400">FIFO — Normativa española (AEAT)</span>
          </div>
          <div className="flex items-center justify-between">
            <span>Fuente de precios</span>
            <span className="mono text-gray-400">Binance API</span>
          </div>
          <div className="flex items-center justify-between">
            <span>Base de datos</span>
            <span className="mono text-gray-400">PostgreSQL 16</span>
          </div>
        </div>
        <p className="text-xs text-gray-700 pt-2 border-t border-border">
          Esta herramienta genera información orientativa. Consulta siempre con un asesor fiscal antes de presentar tu declaración.
        </p>
      </div>

    </div>
  )
}
