import { ChevronUp, ChevronDown, type LucideIcon } from 'lucide-react'

/**
 * Botón de expandir/contraer de cabecera de tabla (icono + título + contador
 * + chevron) de TablaEventos.tsx. Los rendimientos (#544) usan su propia cabecera.
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
      className="flex items-center gap-2 hover:text-fg transition-colors"
    >
      <Icon size={15} className="text-fg-subtle" />
      <span className="font-medium text-sm">{title}</span>
      <span className="text-xs text-fg-subtle">({count} operacion{count !== 1 ? 'es' : ''})</span>
      {expanded ? <ChevronUp size={13} className="text-fg-subtle" /> : <ChevronDown size={13} className="text-fg-subtle" />}
    </button>
  )
}
