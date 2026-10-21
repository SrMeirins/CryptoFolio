import { AlertCircle, AlertTriangle, Info, type LucideIcon } from 'lucide-react'
import type { Notification } from '../api/portfolio'
import { T } from '../utils/colors'

// Ruta a la que navega cada tipo de aviso del sistema al hacer click
// (components/TopBar.tsx: panel de campana; pages/settings/GeneralSection.tsx:
// pestaña de avisos).
export const NOTIFICATION_ROUTES: Record<string, string> = {
  'no-price':            '/settings?tab=assets',
  'lots-no-price':       '/settings?tab=assets',
  'pending-withdrawals': '/history',
  'crypto-deposits':     '/import',
  'fiscal-calendar':     '/fiscal',
  // Cobertura de importaciones (#328)
  'import-stale-binance': '/import',
  'import-stale-bitvavo': '/import',
  'import-huecos':        '/import',
  // Verificación on-chain de direcciones (#336)
  'wallet-discrepancia':  '/settings?tab=wallets',
  'wallet-verificacion':  '/settings?tab=wallets',
}

// Metadata visual por tipo de aviso — antes TopBar.tsx y GeneralSection.tsx
// declaraban cada uno la suya, divergentes entre sí: GeneralSection usaba el
// mismo icono (AlertCircle) para 'error' y 'warning', indistinguibles salvo
// por color (viola WCAG — nunca información solo por color).
export const NOTIFICATION_TYPE_META: Record<Notification['type'], { icon: LucideIcon; color: string; label: string }> = {
  error:   { icon: AlertCircle,   color: T.negative, label: 'Error' },
  warning: { icon: AlertTriangle, color: T.warning, label: 'Aviso' },
  info:    { icon: Info,          color: T.info, label: 'Info'  },
}
