import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Bell } from 'lucide-react'
import { portfolioApi } from '../../api/portfolio'
import { NOTIFICATION_CATEGORIES, NOTIFICATIONS_MUTED_KEY, mutedCategories, type NotificationCategory } from '../../constants/notifications'
import { useSettingFeedback } from '../../hooks/useSettingFeedback'
import { useToast } from '../../hooks/useToast'
import { useBellStore } from '../../store/bellStore'
import { SettingsCard } from './SettingsCard'
import { SavedMark } from './SavedMark'

// Notificaciones en General (#447): un interruptor por categoría con cuántos
// avisos activos tiene. La lista completa vive en la campana de la barra
// superior, que se abre desde aquí.
export function NotificationsCard({ index = 0 }: { index?: number }) {
  const queryClient = useQueryClient()
  const toast = useToast()
  const { saved, confirm } = useSettingFeedback()
  const openBell = useBellStore(s => s.setOpen)
  const { data: config } = useQuery({ queryKey: ['config'], queryFn: portfolioApi.getConfig })
  const { data: all = [] } = useQuery({ queryKey: ['notifications-all'], queryFn: portfolioApi.getAllNotifications, refetchInterval: 60_000 })
  const muted = mutedCategories(config?.[NOTIFICATIONS_MUTED_KEY])
  const active = (key: NotificationCategory) => all.filter(n => n.categoryKey === key && !n.dismissed).length
  const visible = all.filter(n => !n.muted && !n.dismissed).length

  async function setMuted(next: NotificationCategory[], message: string, previous: NotificationCategory[], undoable = true) {
    try {
      await portfolioApi.setConfig(NOTIFICATIONS_MUTED_KEY, JSON.stringify(next))
      await queryClient.invalidateQueries({ queryKey: ['config'] })
      await queryClient.invalidateQueries({ queryKey: ['notifications'] })
      await queryClient.invalidateQueries({ queryKey: ['notifications-all'] })
      confirm('avisos', message, undoable ? () => void setMuted(previous, 'Avisos como antes', next, false) : undefined)
    } catch (e) {
      toast.error('No se pudo guardar', (e as Error).message)
    }
  }
  function toggle(key: NotificationCategory, label: string, on: boolean) {
    // Las silenciadas actuales en el momento del cambio, no las del render.
    const now = mutedCategories(queryClient.getQueryData<Record<string, string>>(['config'])?.[NOTIFICATIONS_MUTED_KEY])
    const next = on ? now.filter(k => k !== key) : [...now, key]
    void setMuted(next, on ? `Avisos de ${label} activados` : `Avisos de ${label} silenciados`, now)
  }

  return (
    <SettingsCard index={index} icon={Bell} title="Notificaciones" status={<SavedMark stamp={saved} id="avisos" />}
      description="Elige qué avisos quieres recibir. Un aviso descartado vuelve a salir si cambia."
      action={
        <button type="button" onClick={() => openBell(true)}
          className="text-xs font-medium text-brand-ink hover:underline rounded-md focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand">
          {visible === 0 ? 'Sin avisos activos' : `Ver ${visible} ${visible === 1 ? 'aviso activo' : 'avisos activos'}`}
        </button>
      }>
      <ul className="grid sm:grid-cols-2 gap-x-6">
        {NOTIFICATION_CATEGORIES.map(c => {
          const on = !muted.includes(c.key)
          const n = active(c.key)
          const id = `aviso-${c.key}`
          return (
            <li key={c.key} className="flex items-center justify-between gap-3 py-2.5 border-b border-border/50">
              <div className="min-w-0">
                <label htmlFor={id} className="text-sm font-medium flex items-center gap-2">
                  {c.label}
                  {n > 0 && <span className={`text-[10px] mono px-1.5 rounded-full ${on ? 'bg-warning/15 text-warning-ink' : 'bg-overlay/8 text-fg-subtle'}`}>{n}</span>}
                </label>
                <p className="text-xs text-fg-subtle truncate">{on ? c.hint : 'Silenciada'}</p>
              </div>
              <label className="inline-flex items-center cursor-pointer shrink-0">
                <input id={id} type="checkbox" role="switch" checked={on} className="peer sr-only"
                  aria-describedby={`${id}-hint`} onChange={e => toggle(c.key, c.label, e.target.checked)} />
                <span id={`${id}-hint`} className="sr-only">{c.hint}{n > 0 ? `, ${n} activos` : ''}</span>
                <span aria-hidden="true"
                  className="relative w-9 h-5 rounded-full bg-overlay/15 ring-1 ring-inset ring-fg-subtle/60 peer-checked:ring-0 transition-colors peer-checked:bg-brand-solid peer-focus-visible:ring-2 peer-focus-visible:ring-brand/60 after:absolute after:top-0.5 after:left-0.5 after:w-4 after:h-4 after:rounded-full after:bg-white after:transition-transform peer-checked:after:translate-x-4" />
              </label>
            </li>
          )
        })}
      </ul>
    </SettingsCard>
  )
}
