import { type KeyboardEvent, type ReactNode } from 'react'
import { optionForKey } from '../../utils/segmented'
import { tabClasses, tabId, tabPanelId, type TabsVariant } from './classes'
import { Hint } from './Tooltip'

// Pestañas (#199): cambian el panel visible. Patrón tablist del WAI-ARIA:
// flechas, Inicio y Fin mueven entre pestañas; cada pestaña controla el panel
// `${idBase}-panel` (el contenedor que la usa le pone ese id).

export interface TabItem<T extends string> {
  value: T
  label: ReactNode
  /** Atajo de teclado de la pestaña: se anuncia (aria-keyshortcuts) y se muestra en un Hint. */
  shortcut?: string
}

export interface TabsProps<T extends string> {
  items: readonly TabItem<T>[]
  value: T
  onChange: (value: T) => void
  label: string
  idBase: string
  variant?: TabsVariant
  className?: string
}

export function Tabs<T extends string>({ items, value, onChange, label, idBase, variant = 'pill', className = '' }: TabsProps<T>) {
  const values = items.map(i => i.value)

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const next = optionForKey(values, value, e.key)
    if (next === null) return
    e.preventDefault()
    onChange(next)
    document.getElementById(tabId(idBase, next))?.focus()
  }

  return (
    <div role="tablist" aria-label={label} onKeyDown={onKeyDown}
      className={`flex items-center ${variant === 'underline' ? 'border-b border-border' : 'gap-1'} ${className}`}>
      {items.map(item => {
        const active = item.value === value
        const tab = (
          <button key={item.value} id={tabId(idBase, item.value)} type="button" role="tab"
            aria-selected={active} aria-controls={tabPanelId(idBase)} tabIndex={active ? 0 : -1}
            aria-keyshortcuts={item.shortcut} onClick={() => onChange(item.value)} className={tabClasses(active, variant)}>
            {item.label}
          </button>
        )
        return item.shortcut ? <Hint key={item.value} label={`Atajo: ${item.shortcut}`} className="shrink-0">{tab}</Hint> : tab
      })}
    </div>
  )
}

/**
 * Nivel 2 de la norma de selección (#492): vistas dentro de una sección, con
 * URL. Pestañas subrayadas que se desplazan en horizontal si no caben.
 */
export function ViewTabs<T extends string>({ className = '', ...props }: Omit<TabsProps<T>, 'variant'>) {
  return <Tabs {...props} variant="underline"
    className={`overflow-x-auto [scrollbar-width:none] [&>button]:shrink-0 max-sm:[&_[role=tab]]:px-3 ${className}`} />
}
