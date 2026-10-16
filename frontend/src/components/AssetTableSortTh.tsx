import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react'
import type { SortKey, SortDir } from '../utils/assetTable'

interface SortThProps {
  label: string
  sk: SortKey
  sortKey: SortKey
  sortDir: SortDir
  onSort: (key: SortKey) => void
  right?: boolean
  title?: string
}

/**
 * Cabecera ordenable de AssetTable (#269): botón accesible con teclado,
 * `aria-sort` en la columna activa y el icono siempre detrás del texto, en
 * una sola línea.
 */
export function SortTh({ label, sk, sortKey, sortDir, onSort, right = true, title }: SortThProps) {
  const active = sortKey === sk
  const Icon = active ? (sortDir === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown
  return (
    <th scope="col" aria-sort={active ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
      className={`px-4 py-2.5 whitespace-nowrap ${right ? 'text-right' : 'text-left'}`}>
      <button type="button" onClick={() => onSort(sk)} title={title}
        className={`group inline-flex items-center gap-1 rounded-md transition-colors hover:text-fg focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand/60 ${active ? 'text-brand' : ''}`}>
        {label}
        <Icon size={10} aria-hidden="true" className={active ? 'text-brand' : 'opacity-40 group-hover:opacity-80'} />
      </button>
    </th>
  )
}
