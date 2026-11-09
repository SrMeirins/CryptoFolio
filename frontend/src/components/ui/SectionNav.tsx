import { useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { ChevronLeft, ChevronRight, type LucideIcon } from 'lucide-react'
import { Hint } from './Tooltip'
import { MEDIUM_QUERY, useMediaQuery } from '../../hooks/useMediaQuery'
import { optionForKey } from '../../utils/segmented'
import { tabId, tabPanelId } from './classes'

// Norma de selección en tres niveles (#492):
// 1. SectionNav: secciones de una página (Ajustes; Fiscal en su épica). Menú
//    lateral con icono, nombre y un dato corto, con URL propia.
// 2. ViewTabs: vistas dentro de una sección, pestañas subrayadas con URL.
// 3. SegmentedControl: opciones de un panel, cambio local y casi instantáneo,
//    sin URL.
// Los tres siguen su patrón ARIA (tablist y tab, o radiogroup) con flechas,
// Inicio y Fin.
//
// SectionNav: vertical desde 1024 px con un indicador que se desliza hasta la
// sección activa; por debajo, la misma lista en horizontal con desplazamiento.
// En vertical (#535) queda fijo al desplazar la página y se puede plegar a
// iconos (se recuerda por menú en este navegador); plegado, cada entrada dice
// su nombre en un Hint. El menú fija su propia anchura (240 px o 56 px). Los
// atajos se anuncian al lector de pantalla y se explican en el panel de atajos.

export interface SectionNavItem<T extends string> {
  value: T
  label: string
  icon: LucideIcon
  /** Dato corto bajo el nombre (en la vista vertical). */
  hint?: ReactNode
  /** Insignia junto al nombre (p. ej. un recuento o un aviso). */
  badge?: ReactNode
  /** Atajo de teclado: se anuncia (aria-keyshortcuts); se explica en el panel de atajos. */
  shortcut?: string
}

export function SectionNav<T extends string>({ items, value, onChange, label, idBase }: {
  items: readonly SectionNavItem<T>[]
  value: T
  onChange: (value: T) => void
  label: string
  idBase: string
}) {
  const wide = !useMediaQuery(MEDIUM_QUERY)
  const storageKey = `cflio_nav_plegado_${idBase}`
  const [folded, setFolded] = useState(() => { try { return localStorage.getItem(storageKey) === '1' } catch { return false } })
  const collapsed = wide && folded
  const toggleFolded = () => {
    setFolded(f => {
      try { localStorage.setItem(storageKey, f ? '0' : '1') } catch { /* solo esta sesión */ }
      return !f
    })
  }
  const listRef = useRef<HTMLDivElement>(null)
  const [indicator, setIndicator] = useState<{ x: number; y: number; w: number; h: number } | null>(null)
  // El indicador sigue a la sección activa y al tamaño de la lista (vertical u horizontal).
  useLayoutEffect(() => {
    const list = listRef.current
    if (!list) return
    const place = () => {
      const el = list.querySelector<HTMLElement>(`#${CSS.escape(tabId(idBase, value))}`)
      if (el) setIndicator({ x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight })
    }
    place()
    const ro = new ResizeObserver(place)
    ro.observe(list)
    return () => ro.disconnect()
  }, [value, idBase, collapsed])

  const values = items.map(i => i.value)
  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const next = optionForKey(values, value, e.key)
    if (next === null) return
    e.preventDefault()
    onChange(next)
    document.getElementById(tabId(idBase, next))?.focus()
  }

  return (
    <div className={`shrink-0 lg:sticky lg:top-4 lg:self-start transition-[width] duration-200 ${collapsed ? 'lg:w-14' : 'lg:w-60'}`}>
    <div ref={listRef} role="tablist" aria-label={label} aria-orientation={wide ? 'vertical' : 'horizontal'} onKeyDown={onKeyDown}
      className="relative flex lg:flex-col gap-1 overflow-x-auto lg:overflow-visible pb-1 lg:pb-0">
      {indicator && (
        <span aria-hidden="true" className="settings-nav-indicator absolute left-0 top-0 rounded-xl bg-brand/10 ring-1 ring-brand/25 pointer-events-none"
          style={{ width: indicator.w, height: indicator.h, transform: `translate(${indicator.x}px, ${indicator.y}px)` }} />
      )}
      {items.map(({ value: v, label: name, icon: Icon, hint, badge, shortcut }) => {
        const on = v === value
        const tab = (
          <button key={v} id={tabId(idBase, v)} type="button" role="tab" aria-selected={on}
            aria-controls={tabPanelId(idBase)} tabIndex={on ? 0 : -1} onClick={() => onChange(v)} aria-keyshortcuts={shortcut}
            aria-label={collapsed ? name : undefined}
            className={`relative shrink-0 w-full flex items-center gap-3 rounded-xl text-left transition-colors focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand ${
              collapsed ? 'lg:justify-center lg:px-0 py-2.5 px-3' : 'px-3 py-2.5'} ${on ? 'text-fg' : 'text-fg-muted hover:text-fg hover:bg-overlay/4'}`}>
            <span aria-hidden="true" className={`hidden lg:grid w-8 h-8 rounded-lg place-items-center shrink-0 transition-colors ${on ? 'bg-brand/15 text-brand-ink' : 'bg-overlay/5 text-fg-subtle'}`}>
              <Icon size={15} />
            </span>
            {collapsed ? (
              // Plegado: solo el icono; la insignia de aviso se mantiene como punto.
              badge && <span className="absolute top-1.5 right-1.5">{badge}</span>
            ) : (
              <span className="min-w-0">
                <span className="flex items-center gap-2 text-sm font-medium">{name}{badge}</span>
                {hint && <span className="hidden lg:block text-[11px] text-fg-subtle truncate">{hint}</span>}
              </span>
            )}
          </button>
        )
        // Plegado, el nombre sale en un Hint; los atajos se explican en el panel de atajos, no al pasar.
        return collapsed ? <Hint key={v} label={name} direction="down" className="shrink-0 lg:w-full">{tab}</Hint> : tab
      })}
    </div>
    {/* Plegar (#535): mismo estilo que el botón de colapsar del menú principal. */}
    {wide && (
      <div className="hidden lg:block mt-2 pt-2 border-t border-border">
        <button type="button" onClick={toggleFolded} aria-expanded={!collapsed} aria-label={collapsed ? `Expandir ${label.toLowerCase()}` : `Plegar ${label.toLowerCase()}`}
          className={`group w-full flex items-center rounded-xl py-2.5 text-fg-subtle hover:text-fg hover:bg-overlay/4 transition-colors focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand ${
            collapsed ? 'justify-center px-0' : 'justify-between px-3'}`}>
          {!collapsed && <span className="text-[11px] font-medium tracking-wide uppercase">Plegar</span>}
          {collapsed
            ? <ChevronRight size={14} aria-hidden="true" className="transition-transform duration-200 group-hover:translate-x-0.5" />
            : <ChevronLeft size={14} aria-hidden="true" className="transition-transform duration-200 group-hover:-translate-x-0.5" />}
        </button>
      </div>
    )}
    </div>
  )
}
