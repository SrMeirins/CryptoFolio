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

/** Cabecera ordenable de AssetTable: muestra el icono de dirección si es la columna activa. */
export function SortTh({ label, sk, sortKey, sortDir, onSort, right = true, title }: SortThProps) {
  const active = sortKey === sk
  const Icon = active ? (sortDir === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown
  return (
    <th
      className={`px-4 py-3 cursor-pointer select-none group ${right ? 'text-right' : 'text-left'}`}
      onClick={() => onSort(sk)}
      title={title}
    >
      <span className="inline-flex items-center gap-1 hover:text-fg transition-colors">
        {right && <Icon size={10} className={active ? 'text-brand' : 'text-fg-subtle group-hover:text-fg-subtle'} />}
        <span className={active ? 'text-brand' : ''}>{label}</span>
        {!right && <Icon size={10} className={active ? 'text-brand' : 'text-fg-subtle group-hover:text-fg-subtle'} />}
      </span>
    </th>
  )
}
