import { useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
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

export interface SectionNavItem<T extends string> {
  value: T
  label: string
  icon: LucideIcon
  /** Dato corto bajo el nombre (en la vista vertical). */
  hint?: ReactNode
  /** Insignia junto al nombre (p. ej. un recuento). */
  badge?: ReactNode
}

export function SectionNav<T extends string>({ items, value, onChange, label, idBase }: {
  items: readonly SectionNavItem<T>[]
  value: T
  onChange: (value: T) => void
  label: string
  idBase: string
}) {
  const wide = !useMediaQuery(MEDIUM_QUERY)
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
  }, [value, idBase])

  const values = items.map(i => i.value)
  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const next = optionForKey(values, value, e.key)
    if (next === null) return
    e.preventDefault()
    onChange(next)
    document.getElementById(tabId(idBase, next))?.focus()
  }

  return (
    <div ref={listRef} role="tablist" aria-label={label} aria-orientation={wide ? 'vertical' : 'horizontal'} onKeyDown={onKeyDown}
      className="relative flex lg:flex-col gap-1 overflow-x-auto lg:overflow-visible pb-1 lg:pb-0">
      {indicator && (
        <span aria-hidden="true" className="settings-nav-indicator absolute left-0 top-0 rounded-xl bg-brand/10 ring-1 ring-brand/25 pointer-events-none"
          style={{ width: indicator.w, height: indicator.h, transform: `translate(${indicator.x}px, ${indicator.y}px)` }} />
      )}
      {items.map(({ value: v, label: name, icon: Icon, hint, badge }) => {
        const on = v === value
        return (
          <button key={v} id={tabId(idBase, v)} type="button" role="tab" aria-selected={on}
            aria-controls={tabPanelId(idBase)} tabIndex={on ? 0 : -1} onClick={() => onChange(v)}
            className={`relative shrink-0 flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand ${
              on ? 'text-fg' : 'text-fg-muted hover:text-fg hover:bg-overlay/4'}`}>
            <span aria-hidden="true" className={`hidden lg:grid w-8 h-8 rounded-lg place-items-center shrink-0 transition-colors ${on ? 'bg-brand/15 text-brand-ink' : 'bg-overlay/5 text-fg-subtle'}`}>
              <Icon size={15} />
            </span>
            <span className="min-w-0">
              <span className="flex items-center gap-2 text-sm font-medium">{name}{badge}</span>
              {hint && <span className="hidden lg:block text-[11px] text-fg-subtle truncate">{hint}</span>}
            </span>
          </button>
        )
      })}
    </div>
  )
}
