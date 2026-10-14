import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { portfolioApi } from '../../api/portfolio'
import { Bell, BellOff, X, ArrowRight, Wrench } from 'lucide-react'
import { NOTIFICATION_ROUTES, NOTIFICATION_TYPE_META } from '../../constants/notifications'
import { CurrencyToggle } from '../../components/CurrencyToggle'
import { ThemeSelector } from '../../components/ThemeSelector'
import { alpha } from '../../utils/colors'
import { cardClasses, buttonClasses, iconButtonClasses } from '../../components/ui'

const NOTIFICATION_LABELS: Record<string, string> = {
  'no-price':            'Ir a Activos',
  'lots-no-price':       'Ir a Activos',
  'pending-withdrawals': 'Ir a Historial',
  'crypto-deposits':     'Ir a Importación',
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
    await portfolioApi.setConfig('notifications_dismissed_at', new Date().toISOString())
    queryClient.invalidateQueries({ queryKey: ['notifications'] })
  }

  async function dismissOne(id: string) {
    await portfolioApi.setConfig(`notification_dismissed_${id}`, new Date().toISOString())
    queryClient.invalidateQueries({ queryKey: ['notifications'] })
  }

  async function fixStaleWithdrawals() {
    const r = await portfolioApi.fixStaleWithdrawals()
    if (r.fixed > 0) queryClient.invalidateQueries({ queryKey: ['notifications'] })
  }

  return (
    <div className="space-y-6 max-w-2xl">

      {/* Tema (#197/#198) */}
      <div className={cardClasses('md')}>
        <div className="flex items-center justify-between gap-4">
          <div>
            <h3 className="font-semibold text-sm">Tema</h3>
            <p className="text-xs text-fg-subtle mt-0.5 leading-relaxed">
              Oscuro, claro o el mismo que el sistema operativo. También puedes alternar entre claro y oscuro desde la barra superior.
            </p>
          </div>
          <ThemeSelector />
        </div>
      </div>

      {/* Moneda de visualización (#176) */}
      <div className={cardClasses('md')}>
        <div className="flex items-center justify-between gap-4">
          <div>
            <h3 className="font-semibold text-sm">Moneda de visualización</h3>
            <p className="text-xs text-fg-subtle mt-0.5 leading-relaxed">
              Moneda en la que se muestran precios, valores y P&amp;L. El dólar se toma del precio de USDT
              en cada fecha. La sección Fiscal se muestra siempre en EUR. También puedes cambiarla desde la barra superior.
            </p>
          </div>
          <CurrencyToggle size="md" />
        </div>
      </div>

      {/* Notificaciones */}
      <div className={cardClasses('md', 'space-y-4')}>
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-sm">Notificaciones del sistema</h3>
            <p className="text-xs text-fg-subtle mt-0.5">Alertas activas que requieren tu atención.</p>
          </div>
          {notifications.length > 0 && (
            <button type="button" onClick={dismissAll}
              className={buttonClasses('secondary', 'sm', 'flex gap-1.5')}>
              <BellOff size={11} /> Descartar todas
            </button>
          )}
        </div>

        {notifications.length === 0 ? (
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-positive/8 border border-positive/20">
            <div className="w-7 h-7 rounded-full bg-positive/15 flex items-center justify-center shrink-0">
              <Bell size={13} className="text-positive" />
            </div>
            <p className="text-sm text-positive">Todo en orden — no hay notificaciones activas.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {notifications.map(n => {
              const { icon: Icon, color, label } = NOTIFICATION_TYPE_META[n.type]
              const dest = NOTIFICATION_ROUTES[n.id]
              const actionLabel = NOTIFICATION_LABELS[n.id]
              return (
                <div key={n.id} className="flex items-start gap-3 px-4 py-3 rounded-xl border"
                  style={{ borderColor: `${alpha(color, 19)}`, backgroundColor: `${alpha(color, 3)}` }}>
                  <Icon size={14} className="mt-0.5 shrink-0" style={{ color }} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-medium" style={{ color }}>{label}</span>
                      <span className="text-xs text-fg-subtle">{n.category}</span>
                      {n.count && n.count > 1 && (
                        <span className="text-xs px-1.5 py-0.5 rounded-full font-semibold"
                          style={{ backgroundColor: `${alpha(color, 13)}`, color }}>
                          ×{n.count}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-fg-muted mt-0.5 leading-relaxed">{n.message}</p>
                    <div className="flex items-center gap-3 mt-2 flex-wrap">
                      {dest && (
                        <button type="button" onClick={() => goTo(dest)}
                          className="inline-flex items-center gap-1 text-xs font-medium transition-colors hover:opacity-80"
                          style={{ color }}>
                          {actionLabel} <ArrowRight size={10} />
                        </button>
                      )}
                      {n.id === 'pending-withdrawals' && (
                        <button type="button" onClick={fixStaleWithdrawals}
                          className="inline-flex items-center gap-1 text-xs font-medium text-fg-subtle hover:text-fg transition-colors">
                          <Wrench size={10} /> Corregir auto ({n.count})
                        </button>
                      )}
                    </div>
                  </div>
                  <button type="button" onClick={() => dismissOne(n.id)} aria-label="Descartar aviso"
                    className={iconButtonClasses('sm')}>
                    <X size={12} />
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Acerca de */}
      <div className={cardClasses('md', 'space-y-3')}>
        <h3 className="font-semibold text-sm">Acerca de CryptoFolio</h3>
        <div className="space-y-2 text-xs text-fg-subtle">
          <div className="flex items-center justify-between">
            <span>Versión</span>
            <span className="mono text-fg-muted">0.3.0-dev</span>
          </div>
          <div className="flex items-center justify-between">
            <span>Método fiscal</span>
            <span className="mono text-fg-muted">FIFO — Normativa española (AEAT)</span>
          </div>
          <div className="flex items-center justify-between">
            <span>Fuente de precios</span>
            <span className="mono text-fg-muted">Binance API</span>
          </div>
          <div className="flex items-center justify-between">
            <span>Base de datos</span>
            <span className="mono text-fg-muted">PostgreSQL 16</span>
          </div>
        </div>
        <p className="text-xs text-fg-subtle pt-2 border-t border-border">
          Esta herramienta genera información orientativa. Consulta siempre con un asesor fiscal antes de presentar tu declaración.
        </p>
      </div>

    </div>
  )
}
