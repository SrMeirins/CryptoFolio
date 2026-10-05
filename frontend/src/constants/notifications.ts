import { AlertCircle, AlertTriangle, Info, type LucideIcon } from 'lucide-react'
import type { Notification } from '../api/portfolio'

// Ruta a la que navega cada tipo de aviso del sistema al hacer click
// (components/TopBar.tsx: panel de campana; pages/settings/GeneralSection.tsx:
// pestaña de avisos).
export const NOTIFICATION_ROUTES: Record<string, string> = {
  'no-price':            '/settings?tab=assets',
  'lots-no-price':       '/settings?tab=assets',
  'pending-withdrawals': '/history',
  'crypto-deposits':     '/import',
}

// Metadata visual por tipo de aviso — antes TopBar.tsx y GeneralSection.tsx
// declaraban cada uno la suya, divergentes entre sí: GeneralSection usaba el
// mismo icono (AlertCircle) para 'error' y 'warning', indistinguibles salvo
// por color (viola WCAG — nunca información solo por color).
export const NOTIFICATION_TYPE_META: Record<Notification['type'], { icon: LucideIcon; color: string; label: string }> = {
  error:   { icon: AlertCircle,   color: '#e74c3c', label: 'Error' },
  warning: { icon: AlertTriangle, color: '#f59e0b', label: 'Aviso' },
  info:    { icon: Info,          color: '#6366f1', label: 'Info'  },
}
