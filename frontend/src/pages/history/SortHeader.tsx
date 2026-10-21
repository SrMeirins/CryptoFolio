import type { ReactNode } from 'react'
import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react'
import { ariaSort, type SortKey, type SortState } from './sorting'

/**
 * Cabecera de columna ordenable (#349): botón accesible con teclado y
 * aria-sort en el <th>, para que el lector de pantalla anuncie el orden.
 */
export function SortHeader({ col, sort, onSort, align = 'left', className = '', children }: {
  col: SortKey
  sort: SortState
  onSort: (col: SortKey) => void
  align?: 'left' | 'right'
  className?: string
  children: ReactNode
}) {
  const state = ariaSort(sort, col)
  const Icon = state === 'none' ? ArrowUpDown : state === 'ascending' ? ArrowUp : ArrowDown
  return (
    <th aria-sort={state} className={`${align === 'right' ? 'text-right' : 'text-left'} font-medium ${className}`}>
      <button type="button" onClick={() => onSort(col)}
        className={`flex items-center hover:text-fg transition-colors rounded focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand/60 ${align === 'right' ? 'ml-auto' : ''}`}>
        {children}
        <Icon size={10} aria-hidden="true" className={`ml-1 ${state === 'none' ? 'text-fg-subtle' : 'text-brand'}`} />
      </button>
    </th>
  )
}
