import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import { ChevronLeft, ChevronRight, X, type LucideIcon } from 'lucide-react'
import { NAV_ITEMS } from '../constants/navigation'
import { MEDIUM_QUERY, NARROW_QUERY, useMediaQuery } from '../hooks/useMediaQuery'
import { useModalA11y } from '../hooks/useModalA11y'
import { useNavStore } from '../store/navStore'

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
          // Texto en fg (contraste > 7:1); el acento lo llevan el icono y la barra (#356).
          ? 'bg-brand/12 text-fg'
          : 'text-fg-subtle hover:text-fg hover:bg-overlay/4'
        }
      `}
    >
      {({ isActive }) => (
        <>
          {/* Indicador de borde izquierdo activo */}
          <span className={`
            absolute left-0 top-1/2 -translate-y-1/2 w-[3px] rounded-r-full
            bg-brand-solid text-on-brand transition-all duration-250
            ${isActive ? 'h-5 opacity-100' : 'h-0 opacity-0'}
          `} />

          <Icon
            size={18}
            aria-hidden="true"
            className={`shrink-0 transition-transform duration-200 ${
              isActive ? 'text-brand' : 'group-hover:scale-110'
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

/**
 * Menú lateral adaptable (#499): a partir de 1024 px, el de siempre (plegable
 * y recordado); entre 768 y 1023 px, plegado a iconos sin tocar la preferencia
 * guardada; por debajo de 768 px, oculto y abierto como cajón superpuesto
 * desde el botón de menú de la barra superior.
 */
export function Sidebar() {
  const narrow = useMediaQuery(NARROW_QUERY)
  const medium = useMediaQuery(MEDIUM_QUERY)
  const mobileOpen = useNavStore(s => s.mobileOpen)
  const setMobileOpen = useNavStore(s => s.setMobileOpen)
  if (narrow) return mobileOpen ? <MobileNav onClose={() => setMobileOpen(false)} /> : null
  return <SidebarPanel forceCollapsed={medium} />
}

/** Cajón del menú en pantallas estrechas: Escape, clic fuera y navegar lo cierran; el foco vuelve al botón. */
function MobileNav({ onClose }: { onClose: () => void }) {
  const panelRef = useModalA11y<HTMLDivElement>(onClose)
  return (
    <div className="fixed inset-0 z-50 flex">
      <div aria-hidden="true" className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div ref={panelRef} id="menu-principal" role="dialog" aria-modal="true" aria-label="Menú principal"
        className="relative h-full w-[240px] max-w-[85vw] flex flex-col bg-background-secondary border-r border-border shadow-2xl">
        <div className="h-16 flex items-center justify-between px-4 border-b border-border shrink-0">
          <span className="flex items-center gap-3">
            <img src="/favicon.svg" width={36} height={36} alt="CryptoFolio" className="shrink-0" />
            <span className="font-bold text-base bg-linear-to-r from-blue-400 to-accent-purple bg-clip-text text-transparent">CryptoFolio</span>
          </span>
          <button type="button" onClick={onClose} aria-label="Cerrar el menú"
            className="p-2 rounded-lg text-fg-subtle hover:text-fg hover:bg-overlay/4 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand">
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <nav aria-label="Principal" className="flex-1 py-3 px-2 space-y-0.5 overflow-y-auto" onClick={e => { if ((e.target as Element).closest('a')) onClose() }}>
          {NAV_ITEMS.map(item => <SidebarNavItem key={item.to} {...item} collapsed={false} />)}
        </nav>
      </div>
    </div>
  )
}

function SidebarPanel({ forceCollapsed }: { forceCollapsed: boolean }) {
  // Persistido: un usuario que colapsa el menú espera que siga colapsado
  // tras recargar, igual que el resto de preferencias de UI del proyecto
  // (ver SETUP_KEY en pages/Import.tsx / pages/Settings.tsx).
  const [savedCollapsed, setCollapsed] = useState(() => localStorage.getItem(COLLAPSED_KEY) === 'true')
  // En pantallas medianas se pliega sin cambiar la preferencia guardada.
  const collapsed = forceCollapsed || savedCollapsed

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
      {/* Logo: 64 px de alto, igual que la barra superior (#200) */}
      <div className={`
        h-16 flex items-center border-b border-border shrink-0 overflow-hidden
        ${collapsed ? 'justify-center' : 'px-4 gap-3'}
      `}>
        {/* Mismo logo que favicon.svg (fuente única) en vez de un SVG
            propio: evita que la marca más visible de la app se quede
            desincronizada del logo real, como ocurría antes. */}
        <img src="/favicon.svg" width={collapsed ? 36 : 44} height={collapsed ? 36 : 44} alt="CryptoFolio" className="shrink-0" />
        {!collapsed && (
          <span className="font-bold text-base leading-tight tracking-tight bg-linear-to-r from-blue-400 to-accent-purple bg-clip-text text-transparent whitespace-nowrap">
            CryptoFolio
          </span>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 py-3 px-2 space-y-0.5 overflow-hidden">
        {NAV_ITEMS.map(item => (
          <SidebarNavItem key={item.to} {...item} collapsed={collapsed} />
        ))}
      </nav>

      {/* Botón de colapsar: no aplica mientras el ancho obliga a plegarlo */}
      {!forceCollapsed && <div className="px-2 py-3 border-t border-border">
        <button
          type="button"
          onClick={toggleCollapsed}
          aria-expanded={!collapsed}
          aria-label={collapsed ? 'Expandir menú' : 'Colapsar menú'}
          title={collapsed ? 'Expandir menú' : 'Colapsar menú'}
          className={`
            group w-full flex items-center rounded-xl py-2.5 text-fg-subtle
            hover:text-fg hover:bg-overlay/4 transition-all duration-200
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
      </div>}
    </aside>
  )
}
