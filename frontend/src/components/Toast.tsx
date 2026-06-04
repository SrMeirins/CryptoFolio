import { createContext, useContext, useState, useCallback, useRef } from 'react'
import { CheckCircle, AlertTriangle, XCircle, Info, X } from 'lucide-react'

type ToastType = 'success' | 'error' | 'warning' | 'info'

interface ToastItem {
  id: string
  type: ToastType
  title: string
  message?: string
  duration?: number
}

interface ToastContextValue {
  addToast: (toast: Omit<ToastItem, 'id'>) => void
  success: (title: string, message?: string) => void
  error:   (title: string, message?: string) => void
  warning: (title: string, message?: string) => void
  info:    (title: string, message?: string) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

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

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  const remove = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id))
    clearTimeout(timers.current[id])
    delete timers.current[id]
  }, [])

  const addToast = useCallback((toast: Omit<ToastItem, 'id'>) => {
    const id = Math.random().toString(36).slice(2)
    setToasts(prev => [...prev.slice(-4), { ...toast, id }])
    const duration = toast.duration ?? (toast.type === 'error' ? 6000 : 4000)
    timers.current[id] = setTimeout(() => remove(id), duration)
  }, [remove])

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
            className={`pointer-events-auto flex items-start gap-3 px-4 py-3 bg-background-card border ${BORDER[t.type]} rounded-xl shadow-xl animate-slide-in`}
          >
            {ICONS[t.type]}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white leading-snug">{t.title}</p>
              {t.message && <p className="text-xs text-gray-400 mt-0.5 leading-snug">{t.message}</p>}
            </div>
            <button
              onClick={() => remove(t.id)}
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

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used inside ToastProvider')
  return ctx
}
