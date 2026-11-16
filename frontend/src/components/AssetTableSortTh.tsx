import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react'
import type { SortKey, SortDir } from '../utils/assetTable'
import { Hint } from './ui'

interface SortThProps {
  label: string
  sk: SortKey
  sortKey: SortKey
  sortDir: SortDir
  onSort: (key: SortKey) => void
  right?: boolean
  title?: string
  className?: string
}

/**
 * Cabecera ordenable de AssetTable (#269): botón accesible con teclado,
 * `aria-sort` en la columna activa y el icono siempre detrás del texto, en
 * una sola línea.
 */
export function SortTh({ label, sk, sortKey, sortDir, onSort, right = true, title, className = 'px-2.5' }: SortThProps) {
  const active = sortKey === sk
  // Las cabeceras de varias palabras largas van en dos líneas (#527): no ensanchan la columna más que su contenido.
  const dosLineas = label.length > 8 && label.includes(' ')
  const Icon = active ? (sortDir === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown
  const button = (
    <button type="button" onClick={() => onSort(sk)}
      className={`group inline-flex items-center gap-1 rounded-md ${dosLineas ? 'max-w-[5.5rem] text-right leading-tight text-balance' : ''} transition-colors hover:text-fg focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand/60 ${active ? 'text-brand' : ''}`}>
      {label}
      <Icon size={10} aria-hidden="true" className={`shrink-0 ${active ? 'text-brand' : 'opacity-40 group-hover:opacity-80'}`} />
    </button>
  )
  return (
    <th scope="col" aria-sort={active ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
      className={`${className} py-2.5 ${dosLineas ? '' : 'whitespace-nowrap'} ${right ? 'text-right' : 'text-left'}`}>
      {title ? <Hint label={title}>{button}</Hint> : button}
    </th>
  )
}
