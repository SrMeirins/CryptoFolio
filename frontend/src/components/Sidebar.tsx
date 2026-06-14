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
    <svg width="34" height="34" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="sBg" x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%"   stopColor="#050A18"/>
          <stop offset="100%" stopColor="#1E1B4B"/>
        </linearGradient>
        <linearGradient id="sBarA" x1="0%" y1="100%" x2="0%" y2="0%">
          <stop offset="0%"   stopColor="#3730A3"/>
          <stop offset="100%" stopColor="#818CF8"/>
        </linearGradient>
        <linearGradient id="sBarB" x1="0%" y1="100%" x2="0%" y2="0%">
          <stop offset="0%"   stopColor="#4338CA"/>
          <stop offset="100%" stopColor="#A5B4FC"/>
        </linearGradient>
        <linearGradient id="sBarC" x1="0%" y1="100%" x2="0%" y2="0%">
          <stop offset="0%"   stopColor="#4F46E5"/>
          <stop offset="100%" stopColor="#C7D2FE"/>
        </linearGradient>
        <linearGradient id="sLine" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%"   stopColor="#6366F1"/>
          <stop offset="100%" stopColor="#22D3EE"/>
        </linearGradient>
        <radialGradient id="sHalo" cx="50%" cy="50%" r="50%">
          <stop offset="0%"   stopColor="#22D3EE" stopOpacity="0.45"/>
          <stop offset="100%" stopColor="#22D3EE" stopOpacity="0"/>
        </radialGradient>
      </defs>
      <rect width="200" height="200" rx="38" fill="url(#sBg)"/>
      <polygon points="100,16 152,46 152,106 100,136 48,106 48,46"
               fill="none" stroke="#6366F1" strokeWidth="1" opacity="0.07"/>
      <rect x="26"  y="108" width="36" height="60" rx="6" fill="url(#sBarA)" opacity="0.80"/>
      <rect x="76"  y="78"  width="36" height="90" rx="6" fill="url(#sBarB)" opacity="0.90"/>
      <rect x="126" y="44"  width="36" height="124" rx="6" fill="url(#sBarC)"/>
      <polyline points="44,103 94,73 144,39"
                stroke="url(#sLine)" strokeWidth="5.5"
                strokeLinecap="round" strokeLinejoin="round" fill="none" opacity="0.95"/>
      <circle cx="144" cy="39" r="20" fill="url(#sHalo)"/>
      <circle cx="144" cy="39" r="9"  fill="#22D3EE"/>
      <circle cx="144" cy="39" r="4.5" fill="white"/>
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
