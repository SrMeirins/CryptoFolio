import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react'
import type { SortKey, SortDir } from './helpers'

export function SortButton({ label, sortKey, active, dir, onClick }: {
  label: string; sortKey: SortKey; active: SortKey; dir: SortDir; onClick: (k: SortKey) => void
}) {
  const isActive = active === sortKey
  return (
    <button type="button" onClick={() => onClick(sortKey)}
      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs transition-colors ${
        isActive ? 'bg-accent-blue/15 text-accent-blue' : 'text-gray-500 hover:text-gray-300 hover:bg-background-tertiary'
      }`}>
      {label}
      {isActive
        ? dir === 'asc' ? <ArrowUp size={11} /> : <ArrowDown size={11} />
        : <ArrowUpDown size={11} className="opacity-40" />
      }
    </button>
  )
}
