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

/** Texto del botón que lleva al sitio donde se resuelve cada aviso (#447). */
export const NOTIFICATION_ACTIONS: Record<string, string> = {
  'no-price': 'Ir a Activos',
  'lots-no-price': 'Ir a Activos',
  'pending-withdrawals': 'Ir a Historial',
  'crypto-deposits': 'Ir a Importar',
  'fiscal-calendar': 'Ir a Fiscal',
  'import-stale-binance': 'Ir a Importar',
  'import-stale-bitvavo': 'Ir a Importar',
  'import-huecos': 'Ir a Importar',
  'wallet-discrepancia': 'Ir a Wallets',
  'wallet-verificacion': 'Ir a Wallets',
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

/** Categorías que se pueden silenciar (#447), con la etiqueta que llevan los avisos. */
export const NOTIFICATION_CATEGORIES = [
  { key: 'precios', label: 'Precios', hint: 'Activos sin precio' },
  { key: 'portfolio', label: 'Portfolio', hint: 'Posiciones que no se pueden valorar' },
  { key: 'retiros', label: 'Retiros', hint: 'Retiros sin wallet de destino' },
  { key: 'depositos', label: 'Depósitos', hint: 'Depósitos de cripto sin coste' },
  { key: 'wallets', label: 'Wallets', hint: 'Verificación de saldos en la blockchain' },
  { key: 'importar', label: 'Importar', hint: 'Exchanges sin importar o con huecos' },
  { key: 'fiscal', label: 'Fiscal', hint: 'Plazos de la Renta y del Modelo 721' },
] as const
export type NotificationCategory = typeof NOTIFICATION_CATEGORIES[number]['key']

/** Clave de config con las categorías silenciadas (lista JSON). */
export const NOTIFICATIONS_MUTED_KEY = 'notifications_muted'

/** Categorías silenciadas desde la config; un valor dañado cuenta como ninguna. */
export function mutedCategories(raw: string | undefined): NotificationCategory[] {
  const known = NOTIFICATION_CATEGORIES.map(c => c.key) as string[]
  try {
    const arr = raw ? JSON.parse(raw) as unknown : []
    return Array.isArray(arr) ? arr.filter((k): k is NotificationCategory => known.includes(k as string)) : []
  } catch { return [] }
}
