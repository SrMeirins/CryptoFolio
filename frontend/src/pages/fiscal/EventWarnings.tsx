import { Tooltip } from '../../components/ui'
import { eventWarnings, WARNINGS } from './eventWarningsData'
import type { FiscalEvent } from './types'

// Avisos de una operación fiscal como iconos con tooltip (#299): sustituyen a
// los bloques de texto que triplicaban la altura de cada fila.

export function EventWarnings({ e }: { e: FiscalEvent }) {
  const list = eventWarnings(e)
  if (list.length === 0) return null
  return (
    <span className="inline-flex items-center gap-0.5">
      {list.map(w => (
        <Tooltip key={w.key} label={w.label} direction="up"
          trigger={<w.icon size={12} aria-hidden="true" />}
          triggerClassName="inline-grid place-items-center size-5 rounded-md text-warning hover:bg-warning/10 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-warning/60">
          <p>{w.detail}</p>
        </Tooltip>
      ))}
    </span>
  )
}

/** Leyenda de los iconos, bajo la tabla. */
export function WarningsLegend() {
  return (
    <p className="flex items-center gap-x-4 gap-y-1 flex-wrap px-4 pb-3 text-[11px] text-fg-subtle">
      {Object.values(WARNINGS).map(w => (
        <span key={w.key} className="inline-flex items-center gap-1"><w.icon size={11} className="text-warning" aria-hidden="true" />{w.label}</span>
      ))}
    </p>
  )
}
