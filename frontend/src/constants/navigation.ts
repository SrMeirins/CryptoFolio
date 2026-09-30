import { LayoutDashboard, TrendingUp, FileText, Upload, Wallet, Settings } from 'lucide-react'

export const NAV_ITEMS = [
  { to: '/',          icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/portfolio', icon: Wallet,          label: 'Portfolio' },
  { to: '/fiscal',    icon: TrendingUp,      label: 'Fiscal'    },
  { to: '/import',    icon: Upload,          label: 'Importar'  },
  { to: '/history',   icon: FileText,        label: 'Historial' },
  { to: '/settings',  icon: Settings,        label: 'Ajustes'   },
]
