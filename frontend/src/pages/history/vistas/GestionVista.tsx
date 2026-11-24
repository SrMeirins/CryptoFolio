import { useRef, useState } from 'react'
import { MoreHorizontal, PenLine, Star, Trash2 } from 'lucide-react'
import type { SavedView } from '../../../api/portfolio'
import { buttonClasses, fieldClasses, Hint, iconButtonClasses, Popover } from '../../../components/ui'

// Gestión de la vista seleccionada del Historial (#552), en el menú «...» de
// sus pestañas: renombrar, marcarla o desmarcarla como predeterminada y
// borrarla con confirmación.

type Pendiente = 'renombrar' | 'borrar' | null

export function GestionVista({ vista, onRenombrar, onPredeterminada, onBorrar }: {
  vista: SavedView
  onRenombrar: (nombre: string) => Promise<void>
  onPredeterminada: () => Promise<void>
  onBorrar: () => Promise<void>
}) {
  const boton = useRef<HTMLButtonElement>(null)
  const [abierto, setAbierto] = useState(false)
  const [pendiente, setPendiente] = useState<Pendiente>(null)
  const [nombre, setNombre] = useState(vista.nombre)
  const [error, setError] = useState<string | null>(null)

  function cerrar() { setAbierto(false); setPendiente(null); setError(null) }
  async function ejecutar(accion: () => Promise<void>) {
    setError(null)
    try { await accion(); cerrar() } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo completar') }
  }

  const item = 'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm text-fg hover:bg-overlay/6 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand'
  return (
    <>
      <Hint label={`Gestionar «${vista.nombre}»`}>
        <button ref={boton} type="button" onClick={() => { setNombre(vista.nombre); setAbierto(a => !a) }} aria-haspopup="dialog" aria-expanded={abierto}
          aria-label={`Gestionar la vista «${vista.nombre}»`} className={iconButtonClasses('sm', abierto)}>
          <MoreHorizontal size={14} aria-hidden="true" />
        </button>
      </Hint>
      <Popover open={abierto} onClose={cerrar} anchorRef={boton} align="end" className="p-1.5 w-72"
        ariaProps={{ role: 'dialog', 'aria-label': `Gestionar la vista «${vista.nombre}»` }}>
        {pendiente === 'renombrar' ? (
          <form className="flex gap-1 p-1.5" onSubmit={e => { e.preventDefault(); if (nombre.trim()) void ejecutar(() => onRenombrar(nombre.trim())) }}>
            <input autoFocus aria-label={`Nuevo nombre para ${vista.nombre}`} value={nombre} maxLength={40}
              onChange={e => setNombre(e.target.value)} className={fieldClasses('sm', false, 'flex-1')} />
            <button type="submit" disabled={!nombre.trim()} className={buttonClasses('primary', 'sm')}>Guardar</button>
          </form>
        ) : pendiente === 'borrar' ? (
          <div role="group" aria-label={`Confirmar el borrado de ${vista.nombre}`} className="flex items-center gap-1 p-1.5 text-xs">
            <span className="flex-1 truncate">¿Borrar «{vista.nombre}»?</span>
            <button type="button" autoFocus onClick={() => setPendiente(null)} className={buttonClasses('ghost', 'sm')}>Cancelar</button>
            <button type="button" onClick={() => void ejecutar(onBorrar)} className={buttonClasses('danger', 'sm')}>Borrar</button>
          </div>
        ) : (
          <ul className="space-y-0.5">
            <li><button type="button" className={item} onClick={() => setPendiente('renombrar')}><PenLine size={14} aria-hidden="true" className="text-fg-subtle" />Renombrar</button></li>
            <li>
              <button type="button" className={item} aria-pressed={vista.predeterminada} onClick={() => void ejecutar(onPredeterminada)}>
                <Star size={14} aria-hidden="true" className={vista.predeterminada ? 'text-warning-ink' : 'text-fg-subtle'} fill={vista.predeterminada ? 'currentColor' : 'none'} />
                {vista.predeterminada ? 'Dejar de abrir con esta vista' : 'Abrir el Historial con esta vista'}
              </button>
            </li>
            <li><button type="button" className={`${item} text-negative-ink`} onClick={() => setPendiente('borrar')}><Trash2 size={14} aria-hidden="true" />Borrar</button></li>
          </ul>
        )}
        {error && <p role="alert" className="px-2.5 pb-1.5 text-xs text-negative-ink">{error}</p>}
      </Popover>
    </>
  )
}
