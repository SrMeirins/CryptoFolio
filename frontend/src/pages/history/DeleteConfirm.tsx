import { useEffect, useRef } from 'react'
import { RefreshCw } from 'lucide-react'
import { buttonClasses } from '../../components/ui'

/**
 * Confirmación en línea del borrado de una transacción manual (#351): botones
 * con texto, el foco pasa a «Cancelar» (la opción segura) y Esc cancela.
 * Quien la muestra devuelve el foco a su botón de origen al cancelar.
 */
export function DeleteConfirm({ onConfirm, onCancel, isDeleting }: {
  onConfirm: () => void
  onCancel: () => void
  isDeleting: boolean
}) {
  const cancelRef = useRef<HTMLButtonElement>(null)
  useEffect(() => { cancelRef.current?.focus() }, [])

  return (
    <div role="group" aria-label="Confirmar el borrado de la transacción" className="flex items-center gap-1"
      onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); onCancel() } }}>
      <span className="text-xs text-fg-subtle">¿Borrar?</span>
      <button type="button" onClick={onConfirm} disabled={isDeleting}
        className={buttonClasses('danger', 'sm', 'px-2 py-0.5 text-xs')}>
        {isDeleting && <RefreshCw size={11} aria-hidden="true" className="animate-spin" />}
        {isDeleting ? 'Borrando…' : 'Borrar'}
      </button>
      <button type="button" ref={cancelRef} onClick={onCancel} disabled={isDeleting}
        className={buttonClasses('ghost', 'sm', 'px-2 py-0.5 text-xs')}>
        Cancelar
      </button>
    </div>
  )
}
