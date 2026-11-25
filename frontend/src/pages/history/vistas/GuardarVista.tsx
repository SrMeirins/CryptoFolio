import { useId, useRef, useState, type FormEvent } from 'react'
import { BookmarkPlus } from 'lucide-react'
import { ApiError } from '../../../api/client'
import { buttonClasses, fieldClasses, Popover } from '../../../components/ui'

// Guardar los filtros actuales como vista del Historial (#369, #552): nombre,
// «abrir con esta vista» y, si el nombre ya existe, confirmar la sustitución.

export function GuardarVista({ etiqueta, onGuardar }: {
  /** Texto del botón: «Guardar vista» o «Guardar como nueva». */
  etiqueta: string
  onGuardar: (nombre: string, predeterminada: boolean, sustituir: boolean) => Promise<void>
}) {
  const id = useId()
  const boton = useRef<HTMLButtonElement>(null)
  const [abierto, setAbierto] = useState(false)
  const [nombre, setNombre] = useState('')
  const [predeterminada, setPredeterminada] = useState(false)
  const [conflicto, setConflicto] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  function cerrar() { setAbierto(false); setConflicto(null); setError(null) }

  async function guardar(e: FormEvent | React.MouseEvent, sustituir: boolean) {
    e.preventDefault()
    if (!nombre.trim()) return
    setError(null)
    try {
      await onGuardar(nombre.trim(), predeterminada, sustituir)
      setNombre(''); setPredeterminada(false); cerrar()
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) setConflicto(nombre.trim())
      else setError(err instanceof Error ? err.message : 'No se pudo guardar la vista')
    }
  }

  return (
    <>
      <button ref={boton} type="button" onClick={() => setAbierto(a => !a)} aria-haspopup="dialog" aria-expanded={abierto}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-brand-ink hover:bg-brand/10 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand whitespace-nowrap">
        <BookmarkPlus size={13} aria-hidden="true" /> {etiqueta}
      </button>
      <Popover open={abierto} onClose={cerrar} anchorRef={boton} align="end" className="p-3 w-80"
        ariaProps={{ role: 'dialog', 'aria-label': etiqueta }}>
        <form onSubmit={e => void guardar(e, false)} className="space-y-2">
          <label htmlFor={`${id}-nombre`} className="block text-xs font-medium text-fg-muted">Nombre de la vista</label>
          <div className="flex gap-1">
            <input id={`${id}-nombre`} autoFocus value={nombre} maxLength={40} placeholder="Por ejemplo, Ventas 2025"
              onChange={e => { setNombre(e.target.value); setConflicto(null) }} className={fieldClasses('sm', false, 'flex-1')} />
            <button type="submit" disabled={!nombre.trim()} className={buttonClasses('primary', 'sm')}>Guardar</button>
          </div>
          <label className="flex items-center gap-2 text-xs text-fg-muted">
            <input type="checkbox" checked={predeterminada} onChange={e => setPredeterminada(e.target.checked)} />
            Abrir el Historial con esta vista
          </label>
          {conflicto && (
            <div role="alert" className="flex items-center gap-1 text-xs">
              <span className="flex-1">Ya existe «{conflicto}». ¿Sustituirla?</span>
              <button type="button" onClick={() => setConflicto(null)} className={buttonClasses('ghost', 'sm')}>Cancelar</button>
              <button type="button" onClick={e => void guardar(e, true)} className={buttonClasses('primary', 'sm')}>Sustituir</button>
            </div>
          )}
          {error && <p role="alert" className="text-xs text-negative-ink">{error}</p>}
        </form>
      </Popover>
    </>
  )
}
