import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard, TrendingUp, FileText, Upload,
  ChevronLeft, ChevronRight, Wallet, Settings,
} from 'lucide-react'

const NAV_ITEMS = [
  { to: '/',          icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/portfolio', icon: Wallet,          label: 'Portfolio' },
  { to: '/fiscal',    icon: TrendingUp,      label: 'Fiscal'    },
  { to: '/import',    icon: Upload,          label: 'Importar'  },
  { to: '/history',   icon: FileText,        label: 'Historial' },
  { to: '/settings',  icon: Settings,        label: 'Ajustes'   },
]

function AppLogo() {
  return (
    <svg width="34" height="34" viewBox="0 0 34 34" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="logoGrad" x1="0" y1="0" x2="34" y2="34" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#3b82f6"/>
          <stop offset="100%" stopColor="#8b5cf6"/>
        </linearGradient>
      </defs>
      <rect width="34" height="34" rx="9" fill="url(#logoGrad)"/>
      <rect x="6.5"  y="22" width="5" height="6"  rx="1.5" fill="white" fillOpacity="0.65"/>
      <rect x="14.5" y="16" width="5" height="12" rx="1.5" fill="white" fillOpacity="0.82"/>
      <rect x="22.5" y="10" width="5" height="18" rx="1.5" fill="white"/>
    </svg>
  )
}

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <aside
      className={`
        flex flex-col bg-background-secondary border-r border-border shrink-0
        transition-all duration-300 ease-in-out
        ${collapsed ? 'w-[60px]' : 'w-[220px]'}
      `}
    >
      {/* Logo */}
      <div className={`
        flex items-center border-b border-border shrink-0 overflow-hidden
        ${collapsed ? 'px-[13px] py-[18px] justify-center' : 'px-4 py-[18px] gap-3'}
      `}>
        <div className="shrink-0">
          <AppLogo />
        </div>
        {!collapsed && (
          <div className="flex flex-col min-w-0 overflow-hidden">
            <span className="font-bold text-[15px] leading-tight tracking-tight bg-gradient-to-r from-blue-400 to-violet-400 bg-clip-text text-transparent whitespace-nowrap">
              CryptoFolio
            </span>
            <span className="text-[10px] text-gray-600 font-medium tracking-wide whitespace-nowrap">
              Portfolio · Fiscal
            </span>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 py-3 px-2 space-y-0.5 overflow-hidden">
        {NAV_ITEMS.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            title={collapsed ? label : undefined}
            className={({ isActive }) => `
              group relative flex items-center rounded-xl text-sm
              transition-all duration-200 overflow-hidden select-none cursor-pointer
              ${collapsed ? 'justify-center px-0 py-[10px]' : 'gap-3 px-3 py-[10px]'}
              ${isActive
                ? 'bg-accent-blue/12 text-accent-blue'
                : 'text-gray-500 hover:text-gray-200 hover:bg-white/[0.04]'
              }
            `}
          >
            {({ isActive }) => (
              <>
                {/* Active left-border indicator */}
                <span className={`
                  absolute left-0 top-1/2 -translate-y-1/2 w-[3px] rounded-r-full
                  bg-accent-blue transition-all duration-250
                  ${isActive ? 'h-5 opacity-100' : 'h-0 opacity-0'}
                `} />

                <Icon
                  size={18}
                  className={`shrink-0 transition-transform duration-200 ${
                    isActive ? '' : 'group-hover:scale-110'
                  }`}
                />

                {!collapsed && (
                  <span className="truncate font-medium text-[13.5px] transition-transform duration-200 group-hover:translate-x-px">
                    {label}
                  </span>
                )}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Collapse button */}
      <div className="px-2 py-3 border-t border-border">
        <button
          onClick={() => setCollapsed(c => !c)}
          title={collapsed ? 'Expandir menú' : 'Colapsar menú'}
          className={`
            group w-full flex items-center rounded-xl py-2.5 text-gray-600
            hover:text-gray-300 hover:bg-white/[0.04] transition-all duration-200
            ${collapsed ? 'justify-center px-0' : 'justify-between px-3'}
          `}
        >
          {!collapsed && (
            <span className="text-[11px] font-medium tracking-wide uppercase">Colapsar</span>
          )}
          <div className="w-5 h-5 flex items-center justify-center">
            {collapsed
              ? <ChevronRight size={14} className="transition-transform duration-200 group-hover:translate-x-0.5" />
              : <ChevronLeft  size={14} className="transition-transform duration-200 group-hover:-translate-x-0.5" />
            }
          </div>
        </button>
      </div>
    </aside>
  )
}
