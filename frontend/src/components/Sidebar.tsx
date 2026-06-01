import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard, TrendingUp, FileText, Upload,
  ChevronLeft, ChevronRight, Wallet, Activity, Settings,
} from 'lucide-react'
import { usePricesStore } from '../store/pricesStore'

const NAV_ITEMS = [
  { to: '/',          icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/portfolio', icon: Wallet,          label: 'Portfolio' },
  { to: '/fiscal',    icon: TrendingUp,      label: 'Fiscal' },
  { to: '/import',    icon: Upload,          label: 'Importar' },
  { to: '/history',   icon: FileText,        label: 'Historial' },
  { to: '/settings',  icon: Settings,        label: 'Ajustes' },
]

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false)
  const connected = usePricesStore((s) => s.connected)

  return (
    <aside
      className={`
        flex flex-col bg-background-secondary border-r border-border
        transition-all duration-300 ease-in-out shrink-0
        ${collapsed ? 'w-16' : 'w-56'}
      `}
    >
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 py-5 border-b border-border">
        <div className="w-8 h-8 rounded-lg bg-accent-blue flex items-center justify-center shrink-0">
          <Activity size={16} className="text-white" />
        </div>
        {!collapsed && (
          <span className="font-semibold text-sm tracking-wide truncate">
            CryptoTracker
          </span>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 py-4 px-2 space-y-1">
        {NAV_ITEMS.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) => `
              flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm
              transition-colors duration-150
              ${isActive
                ? 'bg-accent-blue/10 text-accent-blue'
                : 'text-gray-400 hover:text-white hover:bg-background-tertiary'
              }
            `}
          >
            <Icon size={18} className="shrink-0" />
            {!collapsed && <span className="truncate">{label}</span>}
          </NavLink>
        ))}
      </nav>

      {/* WS status + collapse */}
      <div className="px-3 py-4 border-t border-border space-y-3">
        {!collapsed && (
          <div className="flex items-center gap-2 px-1">
            <div className={`w-2 h-2 rounded-full ${connected ? 'bg-accent-green animate-pulse' : 'bg-gray-500'}`} />
            <span className="text-xs text-gray-500">
              {connected ? 'Precios live' : 'Reconectando...'}
            </span>
          </div>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="w-full flex items-center justify-center p-2 rounded-lg text-gray-500 hover:text-white hover:bg-background-tertiary transition-colors"
        >
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </div>
    </aside>
  )
}
