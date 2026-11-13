import { X } from 'lucide-react'
import { buttonClasses } from '../../components/ui'

// Filtro de varios activos de ?activos= (#524): llega, por ejemplo, desde el
// grupo «Otros» del Dashboard. Una ficha por activo, cada una quitable, y
// «Quitar filtro» para limpiarlo entero (también de la URL).

const FOCO = 'focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand'

export function FiltroActivos({ activos, onQuitar, onLimpiar }: {
  activos: readonly string[]
  onQuitar: (asset: string) => void
  onLimpiar: () => void
}) {
  if (activos.length === 0) return null
  return (
    <div role="group" aria-label={`Filtrando ${activos.length} ${activos.length === 1 ? 'activo' : 'activos'}`}
      className="flex items-center gap-2 flex-wrap rounded-xl border border-brand/30 bg-brand/5 px-3 py-2 text-xs">
      <span className="font-medium text-fg">Filtrando {activos.length} {activos.length === 1 ? 'activo' : 'activos'}:</span>
      <ul className="flex items-center gap-1.5 flex-wrap" aria-label="Activos del filtro">
        {activos.map(a => (
          <li key={a} className="inline-flex items-center gap-1 rounded-lg bg-overlay/8 pl-2 pr-1 py-0.5">
            <span className="mono font-semibold text-fg">{a}</span>
            <button type="button" onClick={() => onQuitar(a)} aria-label={`Quitar ${a} del filtro`} className={`rounded p-0.5 hover:bg-overlay/15 ${FOCO}`}>
              <X size={11} aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
      <button type="button" onClick={onLimpiar} className={buttonClasses('ghost', 'sm', 'ml-auto')}>Quitar filtro</button>
    </div>
  )
}
