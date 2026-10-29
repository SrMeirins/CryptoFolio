import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Bell, BellOff, X, Wrench, ArrowRight } from 'lucide-react'
import { portfolioApi, type Notification } from '../api/portfolio'
import { NOTIFICATION_ACTIONS, NOTIFICATION_ROUTES, NOTIFICATION_TYPE_META } from '../constants/notifications'
import { useClickOutside } from '../hooks/useClickOutside'
import { useToast } from '../hooks/useToast'
import { useBellStore } from '../store/bellStore'
import { T, alpha, ink } from '../utils/colors'
import { buttonClasses, cardClasses, iconButtonClasses } from './ui'

// Campana de avisos de la barra superior (#447): la lista completa de avisos
// activos, cada uno con su acción y Descartar (oculto hasta que cambie su
// contenido). Accesible con teclado: botones reales y Escape cierra.
export function NotificationsBell() {
  const open = useBellStore(s => s.open)
  const setOpen = useBellStore(s => s.setOpen)
  const panelRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const toast = useToast()
  const buttonRef = useRef<HTMLButtonElement>(null)
  useClickOutside(panelRef, () => setOpen(false), open)
  // Escape cierra aunque el foco se haya perdido (p. ej. al descartar el aviso
  // que lo tenía) y devuelve el foco a la campana.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setOpen(false)
      buttonRef.current?.focus()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, setOpen])

  const { data: notifications = [] } = useQuery<Notification[]>({
    queryKey: ['notifications'],
    queryFn: portfolioApi.getNotifications,
    refetchInterval: 60_000,
  })
  const errorCount = notifications.filter(n => n.type === 'error').length
  const warningCount = notifications.filter(n => n.type === 'warning').length
  const total = notifications.length
  const badgeColor = errorCount > 0 ? T.negative : warningCount > 0 ? T.warning : T.brand

  async function dismiss(ids?: string[]) {
    try {
      await portfolioApi.dismissNotifications(ids)
      await queryClient.invalidateQueries({ queryKey: ['notifications'] })
      await queryClient.invalidateQueries({ queryKey: ['notifications-all'] })
      // El botón descartado ya no existe: el foco vuelve al panel, no se pierde.
      panelRef.current?.querySelector<HTMLElement>('#panel-avisos li button, #panel-avisos button')?.focus()
    } catch (e) {
      toast.error('No se pudo descartar', (e as Error).message)
    }
  }
  async function fixStaleWithdrawals() {
    const r = await portfolioApi.fixStaleWithdrawals()
    if (r.fixed > 0) await queryClient.invalidateQueries({ queryKey: ['notifications'] })
  }

  return (
    <div className="relative" ref={panelRef}>
      <button ref={buttonRef} type="button" onClick={() => setOpen(!open)} aria-expanded={open} aria-controls={open ? 'panel-avisos' : undefined}
        aria-label={total > 0 ? `Avisos del sistema: ${total}` : 'Avisos del sistema: ninguno'} title="Avisos del sistema"
        className={`relative p-2 rounded-lg transition-colors focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand ${
          open ? 'bg-background-tertiary text-fg' : 'text-fg-subtle hover:text-fg hover:bg-background-tertiary'}`}>
        <Bell size={18} aria-hidden="true" />
        {total > 0 && (
          <span aria-hidden="true" className="absolute -top-0.5 -right-0.5 min-w-4 h-4 px-0.5 rounded-full text-white flex items-center justify-center font-bold text-[10px]"
            style={{ backgroundColor: badgeColor }}>
            {total > 9 ? '9+' : total}
          </span>
        )}
      </button>

      {open && (
        <div id="panel-avisos" role="dialog" aria-label="Avisos del sistema"
          className={cardClasses('none', 'absolute top-full right-0 mt-2 w-96 shadow-2xl z-50 overflow-hidden')}>
          <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-border">
            <span className="text-sm font-semibold">Avisos del sistema</span>
            <span className="flex items-center gap-1">
              {total > 1 && (
                <button type="button" onClick={() => void dismiss()} className={buttonClasses('ghost', 'sm', 'flex gap-1.5')}>
                  <BellOff size={11} aria-hidden="true" /> Descartar todas
                </button>
              )}
              <button type="button" onClick={() => setOpen(false)} aria-label="Cerrar avisos" className={iconButtonClasses('sm')}>
                <X size={14} aria-hidden="true" />
              </button>
            </span>
          </div>
          <div className="max-h-[480px] overflow-y-auto">
            {total === 0 ? (
              <div className="flex flex-col items-center gap-2 py-8 text-center">
                <Bell size={20} aria-hidden="true" className="text-fg-subtle" />
                <p className="text-xs text-fg-subtle">Sin avisos. Todo en orden.</p>
              </div>
            ) : (
              <ul className="divide-y divide-border/50">
                {notifications.map(n => {
                  const { icon: Icon, color, label } = NOTIFICATION_TYPE_META[n.type]
                  const dest = NOTIFICATION_ROUTES[n.id]
                  return (
                    <li key={n.id} className="flex gap-3 px-4 py-3.5" style={{ backgroundColor: alpha(color, 3) }}>
                      <Icon size={15} aria-hidden="true" className="shrink-0 mt-0.5" style={{ color }} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-semibold" style={{ color: ink(color) }}>{n.category}</span>
                          <span className="text-xs px-1.5 py-0.5 rounded-lg" style={{ backgroundColor: alpha(color, 13), color: ink(color) }}>{label}</span>
                        </div>
                        <p className="text-xs text-fg leading-relaxed">{n.message}</p>
                        <div className="flex items-center gap-3 mt-2 flex-wrap">
                          {dest && (
                            <button type="button" onClick={() => { navigate(dest); setOpen(false) }}
                              className="inline-flex items-center gap-1 text-xs font-medium rounded-md hover:underline focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand"
                              style={{ color: ink(color) }}>
                              {NOTIFICATION_ACTIONS[n.id] ?? 'Ver'} <ArrowRight size={11} aria-hidden="true" />
                            </button>
                          )}
                          {n.id === 'pending-withdrawals' && (
                            <button type="button" onClick={() => void fixStaleWithdrawals()}
                              className="inline-flex items-center gap-1 text-xs font-medium text-fg-muted hover:text-fg rounded-md focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand">
                              <Wrench size={11} aria-hidden="true" /> Corregir los forzados por el exchange
                            </button>
                          )}
                        </div>
                      </div>
                      <button type="button" onClick={() => void dismiss([n.id])} aria-label={`Descartar el aviso de ${n.category}`}
                        title="Descartar hasta que cambie" className={iconButtonClasses('sm', false, 'shrink-0 self-start')}>
                        <X size={12} aria-hidden="true" />
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
