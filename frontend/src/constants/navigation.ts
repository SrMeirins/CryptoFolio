import { LayoutDashboard, TrendingUp, FileText, Upload, Wallet, Settings, type LucideIcon } from 'lucide-react'

export const NAV_ITEMS = [
  { to: '/',          icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/portfolio', icon: Wallet,          label: 'Portfolio' },
  { to: '/fiscal',    icon: TrendingUp,      label: 'Fiscal'    },
  { to: '/import',    icon: Upload,          label: 'Importar'  },
  { to: '/history',   icon: FileText,        label: 'Historial' },
  { to: '/settings',  icon: Settings,        label: 'Ajustes'   },
]

/** Icono de una sección, el mismo del menú lateral (cabeceras de página, #232). */
export function navIcon(to: string): LucideIcon {
  return NAV_ITEMS.find(item => item.to === to)?.icon ?? LayoutDashboard
}
