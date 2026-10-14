import { type KeyboardEvent, type ReactNode } from 'react'
import { optionForKey } from '../../utils/segmented'
import { tabClasses, tabId, tabPanelId, type TabsVariant } from './classes'

// Pestañas (#199): cambian el panel visible. Patrón tablist del WAI-ARIA:
// flechas, Inicio y Fin mueven entre pestañas; cada pestaña controla el panel
// `${idBase}-panel` (el contenedor que la usa le pone ese id).

export interface TabItem<T extends string> {
  value: T
  label: ReactNode
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
        return (
          <button key={item.value} id={tabId(idBase, item.value)} type="button" role="tab"
            aria-selected={active} aria-controls={tabPanelId(idBase)} tabIndex={active ? 0 : -1}
            onClick={() => onChange(item.value)} className={tabClasses(active, variant)}>
            {item.label}
          </button>
        )
      })}
    </div>
  )
}
