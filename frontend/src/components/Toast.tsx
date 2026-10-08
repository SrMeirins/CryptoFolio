import { useState, useCallback, useRef } from 'react'
import { CheckCircle, AlertTriangle, XCircle, Info, X } from 'lucide-react'
import { ToastContext, type ToastItem, type ToastType } from './toastContext'

const ICONS: Record<ToastType, React.ReactNode> = {
  success: <CheckCircle  size={15} className="text-accent-green  shrink-0 mt-0.5" />,
  error:   <XCircle      size={15} className="text-accent-red    shrink-0 mt-0.5" />,
  warning: <AlertTriangle size={15} className="text-accent-amber  shrink-0 mt-0.5" />,
  info:    <Info          size={15} className="text-accent-blue   shrink-0 mt-0.5" />,
}

const BORDER: Record<ToastType, string> = {
  success: 'border-accent-green/30',
  error:   'border-accent-red/30',
  warning: 'border-accent-amber/30',
  info:    'border-accent-blue/30',
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

interface TimerState {
  duration:  number
  remaining: number
  startedAt: number
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  // Tiempo restante y de inicio por toast — permite pausar el auto-cierre
  // al pasar el ratón por encima (para poder terminar de leer un mensaje
  // largo, p. ej. un aviso de fallo de recálculo FIFO) y reanudarlo desde
  // donde se quedó, no desde el principio, al quitar el ratón.
  const timerState = useRef<Record<string, TimerState>>({})

  const remove = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id))
    clearTimeout(timers.current[id])
    delete timers.current[id]
    delete timerState.current[id]
  }, [])

  const scheduleTimer = useCallback((id: string, ms: number) => {
    timers.current[id] = setTimeout(() => remove(id), ms)
  }, [remove])

  const addToast = useCallback((toast: Omit<ToastItem, 'id'>) => {
    const id = Math.random().toString(36).slice(2)
    setToasts(prev => [...prev.slice(-4), { ...toast, id }])
    const duration = toast.duration ?? (toast.type === 'error' ? 6000 : 4000)
    timerState.current[id] = { duration, remaining: duration, startedAt: Date.now() }
    scheduleTimer(id, duration)
  }, [scheduleTimer])

  const pause = useCallback((id: string) => {
    const state = timerState.current[id]
    if (!state) return
    clearTimeout(timers.current[id])
    state.remaining = Math.max(0, state.remaining - (Date.now() - state.startedAt))
  }, [])

  const resume = useCallback((id: string) => {
    const state = timerState.current[id]
    if (!state) return
    state.startedAt = Date.now()
    scheduleTimer(id, state.remaining)
  }, [scheduleTimer])

  const success = useCallback((title: string, message?: string) => addToast({ type: 'success', title, message }), [addToast])
  const error   = useCallback((title: string, message?: string) => addToast({ type: 'error',   title, message }), [addToast])
  const warning = useCallback((title: string, message?: string) => addToast({ type: 'warning', title, message }), [addToast])
  const info    = useCallback((title: string, message?: string) => addToast({ type: 'info',    title, message }), [addToast])

  return (
    <ToastContext.Provider value={{ addToast, success, error, warning, info }}>
      {children}
      <div className="fixed bottom-5 right-5 z-[200] flex flex-col gap-2 w-80 pointer-events-none">
        {toasts.map(t => (
          <div
            key={t.id}
            role={ROLE[t.type]}
            onMouseEnter={() => pause(t.id)}
            onMouseLeave={() => resume(t.id)}
            className={`pointer-events-auto flex items-start gap-3 px-4 py-3 bg-background-card border ${BORDER[t.type]} rounded-xl shadow-xl animate-slide-in`}
          >
            {ICONS[t.type]}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white leading-snug">{t.title}</p>
              {t.message && <p className="text-xs text-gray-400 mt-0.5 leading-snug">{t.message}</p>}
            </div>
            <button
              type="button"
              onClick={() => remove(t.id)}
              aria-label="Cerrar notificación"
              className="text-gray-600 hover:text-gray-400 transition-colors shrink-0 mt-0.5"
            >
              <X size={13} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
