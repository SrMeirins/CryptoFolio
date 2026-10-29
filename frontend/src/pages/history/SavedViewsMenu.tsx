import { useId, useRef, useState, type FormEvent } from 'react'
import { Bookmark, ChevronDown, PenLine, Star, Trash2 } from 'lucide-react'
import type { SavedView } from '../../api/portfolio'
import { ApiError } from '../../api/client'
import { Popover, buttonClasses, fieldClasses, iconButtonClasses } from '../../components/ui'

// Desplegable «Vistas» del Historial (#369): aplicar una vista guardada,
// guardar la actual (con confirmación si el nombre existe), renombrar, borrar
// y marcar la predeterminada. Panel con role="dialog"; todo usable con teclado.

type Pending = { kind: 'rename'; id: string; nombre: string } | { kind: 'delete'; id: string } | null

export function SavedViewsMenu({ views, active, onApply, onSave, onRename, onDelete, onToggleDefault }: {
  views: readonly SavedView[]
  active: SavedView | null
  onApply: (view: SavedView) => void
  onSave: (nombre: string, predeterminada: boolean, sustituir: boolean) => Promise<void>
  onRename: (id: string, nombre: string) => Promise<void>
  onDelete: (id: string) => Promise<void>
  onToggleDefault: (view: SavedView) => Promise<void>
}) {
  const triggerRef = useRef<HTMLButtonElement>(null)
  const nameId = useId()
  const [open, setOpen] = useState(false)
  const [nombre, setNombre] = useState('')
  const [predeterminada, setPredeterminada] = useState(false)
  const [conflict, setConflict] = useState<string | null>(null)
  const [pending, setPending] = useState<Pending>(null)
  const [error, setError] = useState<string | null>(null)

  async function run(action: () => Promise<void>) {
    setError(null)
    try { await action() } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo completar la acción') }
  }

  async function save(e: FormEvent, sustituir = false) {
    e.preventDefault()
    setError(null)
    try {
      await onSave(nombre.trim(), predeterminada, sustituir)
      setNombre(''); setPredeterminada(false); setConflict(null)
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) setConflict(nombre.trim())
      else setError(err instanceof Error ? err.message : 'No se pudo guardar la vista')
    }
  }

  return (
    <>
      <button ref={triggerRef} type="button" onClick={() => setOpen(o => !o)} aria-haspopup="dialog" aria-expanded={open}
        aria-label={active ? `Vistas guardadas (activa: ${active.nombre})` : 'Vistas guardadas'}
        className={buttonClasses('secondary', 'sm', 'flex gap-1.5 max-w-[220px]')}>
        <Bookmark size={13} aria-hidden="true" className={active ? 'text-brand' : ''} />
        <span className="truncate">{active ? active.nombre : 'Vistas'}</span>
        <ChevronDown size={12} aria-hidden="true" />
      </button>

      <Popover open={open} onClose={() => { setOpen(false); setPending(null); setConflict(null) }} anchorRef={triggerRef} align="end"
        className="p-3 w-80" ariaProps={{ role: 'dialog', 'aria-label': 'Vistas guardadas' }}>
        {views.length === 0
          ? <p className="text-xs text-fg-subtle mb-3">Aún no hay vistas guardadas.</p>
          : (
            <ul className="space-y-0.5 mb-3 max-h-64 overflow-auto">
              {views.map(v => (
                <li key={v.id} className="flex items-center gap-1">
                  {pending?.kind === 'rename' && pending.id === v.id ? (
                    <form className="flex-1 flex gap-1" onSubmit={e => { e.preventDefault(); void run(async () => { await onRename(v.id, pending.nombre.trim()); setPending(null) }) }}>
                      <input autoFocus aria-label={`Nuevo nombre para ${v.nombre}`} value={pending.nombre} maxLength={40}
                        onChange={e => setPending({ ...pending, nombre: e.target.value })} className={fieldClasses('sm', false, 'flex-1')} />
                      <button type="submit" disabled={!pending.nombre.trim()} className={buttonClasses('primary', 'sm')}>Guardar</button>
                      <button type="button" onClick={() => setPending(null)} className={buttonClasses('ghost', 'sm')}>Cancelar</button>
                    </form>
                  ) : pending?.kind === 'delete' && pending.id === v.id ? (
                    <div role="group" aria-label={`Confirmar el borrado de ${v.nombre}`} className="flex-1 flex items-center gap-1 text-xs">
                      <span className="flex-1 truncate">¿Borrar «{v.nombre}»?</span>
                      <button type="button" autoFocus onClick={() => setPending(null)} className={buttonClasses('ghost', 'sm')}>Cancelar</button>
                      <button type="button" onClick={() => void run(async () => { await onDelete(v.id); setPending(null) })} className={buttonClasses('danger', 'sm')}>Borrar</button>
                    </div>
                  ) : (
                    <>
                      <button type="button" onClick={() => { onApply(v); setOpen(false) }} aria-current={active?.id === v.id || undefined}
                        className={`flex-1 min-w-0 text-left px-2 py-1.5 rounded-lg text-sm truncate hover:bg-overlay/6 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand ${active?.id === v.id ? 'text-brand-ink font-medium' : 'text-fg'}`}>
                        {v.nombre}
                      </button>
                      <button type="button" onClick={() => void run(() => onToggleDefault(v))} aria-pressed={v.predeterminada}
                        aria-label={`${v.predeterminada ? 'Quitar' : 'Marcar'} «${v.nombre}» como predeterminada`} title="Predeterminada"
                        className={iconButtonClasses('sm', false, v.predeterminada ? 'text-warning-ink' : '')}>
                        <Star size={12} aria-hidden="true" fill={v.predeterminada ? 'currentColor' : 'none'} />
                      </button>
                      <button type="button" onClick={() => setPending({ kind: 'rename', id: v.id, nombre: v.nombre })}
                        aria-label={`Renombrar «${v.nombre}»`} className={iconButtonClasses('sm')}><PenLine size={12} aria-hidden="true" /></button>
                      <button type="button" onClick={() => setPending({ kind: 'delete', id: v.id })}
                        aria-label={`Borrar «${v.nombre}»`} className={iconButtonClasses('sm', false, '', 'danger')}><Trash2 size={12} aria-hidden="true" /></button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}

        <form onSubmit={e => void save(e, false)} className="border-t border-border pt-3 space-y-2">
          <label htmlFor={nameId} className="block text-xs font-medium text-fg-muted">Guardar vista actual</label>
          <div className="flex gap-1">
            <input id={nameId} value={nombre} maxLength={40} placeholder="Nombre (p. ej. Ventas 2025)"
              onChange={e => { setNombre(e.target.value); setConflict(null) }} className={fieldClasses('sm', false, 'flex-1')} />
            <button type="submit" disabled={!nombre.trim()} className={buttonClasses('primary', 'sm')}>Guardar</button>
          </div>
          <label className="flex items-center gap-2 text-xs text-fg-muted">
            <input type="checkbox" checked={predeterminada} onChange={e => setPredeterminada(e.target.checked)} />
            Abrir el Historial con esta vista
          </label>
          {conflict && (
            <div role="alert" className="flex items-center gap-1 text-xs">
              <span className="flex-1">Ya existe «{conflict}». ¿Sustituirla?</span>
              <button type="button" onClick={() => setConflict(null)} className={buttonClasses('ghost', 'sm')}>Cancelar</button>
              <button type="button" onClick={e => void save(e, true)} className={buttonClasses('primary', 'sm')}>Sustituir</button>
            </div>
          )}
          {error && <p role="alert" className="text-xs text-negative-ink">{error}</p>}
        </form>
      </Popover>
    </>
  )
}
