import { useState, useCallback, useRef } from 'react'
import { CheckCircle, AlertTriangle, XCircle, Info, X } from 'lucide-react'
import { ToastContext, type ToastItem, type ToastType } from './toastContext'
import { iconButtonClasses } from './ui'
import { createToastTimer, toastDuration } from './toastTiming'
import { explicarFallo } from '../utils/explicarFallo'

const ICONS: Record<ToastType, React.ReactNode> = {
  success: <CheckCircle  size={15} className="text-positive  shrink-0 mt-0.5" />,
  error:   <XCircle      size={15} className="text-negative    shrink-0 mt-0.5" />,
  warning: <AlertTriangle size={15} className="text-warning  shrink-0 mt-0.5" />,
  info:    <Info          size={15} className="text-info   shrink-0 mt-0.5" />,
}

const BORDER: Record<ToastType, string> = {
  success: 'border-positive/30',
  error:   'border-negative/30',
  warning: 'border-warning/30',
  info:    'border-info/30',
}

// role="alert" (error) implica aria-live="assertive": interrumpe al lector
// de pantalla de inmediato, apropiado para fallos. role="status" (el resto)
// implica aria-live="polite": se anuncia sin interrumpir lo que se esté
// leyendo. Ambos roles ya incluyen la semántica de región viva — no hace
// falta añadir aria-live por separado.
const ROLE: Record<ToastType, 'alert' | 'status'> = {
  success: 'status',
  error:   'alert',
  warning: 'status',
  info:    'status',
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  // Un temporizador por aviso; se pausa con el ratón o el foco encima (toastTiming).
  const timers = useRef<Record<string, ReturnType<typeof createToastTimer>>>({})

  const remove = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id))
    timers.current[id]?.clear()
    delete timers.current[id]
  }, [])

  const addToast = useCallback((toast: Omit<ToastItem, 'id'>) => {
    const id = Math.random().toString(36).slice(2)
    setToasts(prev => [...prev.slice(-4), { ...toast, id }])
    timers.current[id] = createToastTimer(toastDuration(toast), () => remove(id))
  }, [remove])

  const pause = useCallback((id: string) => { timers.current[id]?.pause() }, [])
  const resume = useCallback((id: string) => { timers.current[id]?.resume() }, [])

  const success = useCallback((title: string, message?: string) => addToast({ type: 'success', title, message }), [addToast])
  const error   = useCallback((title: string, message?: string) => addToast({ type: 'error',   title, message }), [addToast])
  const warning = useCallback((title: string, message?: string) => addToast({ type: 'warning', title, message }), [addToast])
  const info    = useCallback((title: string, message?: string) => addToast({ type: 'info',    title, message }), [addToast])
  const fail    = useCallback((title: string, err: unknown) => addToast({ type: 'error', title, message: explicarFallo(err) }), [addToast])

  return (
    <ToastContext.Provider value={{ addToast, success, error, warning, info, fail }}>
      {children}
      <div className="fixed bottom-5 right-5 z-200 flex flex-col gap-2 w-80 pointer-events-none">
        {toasts.map(t => (
          <div
            key={t.id}
            role={ROLE[t.type]}
            onMouseEnter={() => pause(t.id)}
            onMouseLeave={() => resume(t.id)}
            // También con el foco dentro (#445): el teclado llega a la acción sin que se cierre.
            onFocus={() => pause(t.id)}
            onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget)) resume(t.id) }}
            className={`pointer-events-auto flex items-start gap-3 px-4 py-3 bg-background-card border ${BORDER[t.type]} rounded-xl shadow-xl animate-slide-in`}
          >
            {ICONS[t.type]}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-fg leading-snug">{t.title}</p>
              {t.message && <p className="text-xs text-fg-muted mt-0.5 leading-snug">{t.message}</p>}
            </div>
            {t.action && (
              <button type="button" onClick={() => { t.action!.onClick(); remove(t.id) }}
                className="shrink-0 -my-0.5 px-2 py-1 rounded-md text-xs font-semibold text-brand-ink hover:bg-brand/10 transition-colors focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand">
                {t.action.label}
              </button>
            )}
            <button
              type="button"
              onClick={() => remove(t.id)}
              aria-label="Cerrar notificación"
              className={iconButtonClasses('sm', false, 'mt-0.5')}
            >
              <X size={13} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
