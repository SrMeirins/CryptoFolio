import { ChevronUp, ChevronDown, type LucideIcon } from 'lucide-react'

/**
 * Botón de expandir/contraer de cabecera de tabla (icono + título + contador
 * + chevron) — mismo patrón repetido en TablaRendimientos.tsx y
 * TablaEventos.tsx (pendiente de migrar en su propio turno).
 */
export function TableExpandToggle({ icon: Icon, title, count, expanded, onToggle }: {
  icon: LucideIcon
  title: string
  count: number
  expanded: boolean
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={expanded}
      className="flex items-center gap-2 hover:text-white transition-colors"
    >
      <Icon size={15} className="text-gray-500" />
      <span className="font-medium text-sm">{title}</span>
      <span className="text-xs text-gray-500">({count} operacion{count !== 1 ? 'es' : ''})</span>
      {expanded ? <ChevronUp size={13} className="text-gray-500" /> : <ChevronDown size={13} className="text-gray-500" />}
    </button>
  )
}
