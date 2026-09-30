import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import { ChevronLeft, ChevronRight, type LucideIcon } from 'lucide-react'
import { NAV_ITEMS } from '../constants/navigation'

const COLLAPSED_KEY = 'cflio_sidebar_collapsed'

interface SidebarNavItemProps {
  to: string
  icon: LucideIcon
  label: string
  collapsed: boolean
}

function SidebarNavItem({ to, icon: Icon, label, collapsed }: SidebarNavItemProps) {
  return (
    <NavLink
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
          {/* Indicador de borde izquierdo activo */}
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
  )
}

export function Sidebar() {
  // Persistido: un usuario que colapsa el menú espera que siga colapsado
  // tras recargar, igual que el resto de preferencias de UI del proyecto
  // (ver SETUP_KEY en pages/Import.tsx / pages/Settings.tsx).
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(COLLAPSED_KEY) === 'true')

  function toggleCollapsed() {
    setCollapsed(c => {
      const next = !c
      localStorage.setItem(COLLAPSED_KEY, String(next))
      return next
    })
  }

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
        {/* Mismo logo que favicon.svg (fuente única) en vez de un SVG
            propio: evita que la marca más visible de la app se quede
            desincronizada del logo real, como ocurría antes. */}
        <img src="/favicon.svg" width={34} height={34} alt="CryptoFolio" className="shrink-0" />
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
        {NAV_ITEMS.map(item => (
          <SidebarNavItem key={item.to} {...item} collapsed={collapsed} />
        ))}
      </nav>

      {/* Botón de colapsar */}
      <div className="px-2 py-3 border-t border-border">
        <button
          type="button"
          onClick={toggleCollapsed}
          aria-expanded={!collapsed}
          aria-label={collapsed ? 'Expandir menú' : 'Colapsar menú'}
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
