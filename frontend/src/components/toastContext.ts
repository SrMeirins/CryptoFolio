import { createContext } from 'react'

// Contexto y tipos del sistema de notificaciones, separados del componente
// ToastProvider para que Fast Refresh pueda recargar Toast.tsx en caliente.

export type ToastType = 'success' | 'error' | 'warning' | 'info'

export interface ToastItem {
  id: string
  type: ToastType
  title: string
  message?: string
  duration?: number
  /** Acción opcional, p. ej. «Deshacer» (#445); al pulsarla se cierra el aviso. */
  action?: { label: string; onClick: () => void }
}

export interface ToastContextValue {
  addToast: (toast: Omit<ToastItem, 'id'>) => void
  success: (title: string, message?: string) => void
  error:   (title: string, message?: string) => void
  warning: (title: string, message?: string) => void
  info:    (title: string, message?: string) => void
}

export const ToastContext = createContext<ToastContextValue | null>(null)
