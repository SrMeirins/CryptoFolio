import { useEffect, useRef, useId } from 'react'
import { AlertTriangle, X } from 'lucide-react'

interface ConfirmDialogProps {
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  danger = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const titleId   = useId()
  const messageId = useId()
  const dialogRef = useRef<HTMLDivElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)

  // Foco al botón de cancelar al abrir (nunca al de confirmar, aunque no
  // sea "danger" — evita que un Enter accidental dispare la acción) y
  // restaurado al elemento que tenía el foco antes de abrir el diálogo al
  // cerrarlo. Escape cierra como cancelar. Tab/Shift+Tab quedan atrapados
  // dentro del diálogo mientras está abierto (un modal no debe dejar
  // navegar por teclado al contenido de detrás).
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null
    cancelRef.current?.focus()

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        onCancel()
        return
      }
      if (e.key !== 'Tab' || !dialogRef.current) return
      const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      )
      if (focusable.length === 0) return
      const first = focusable[0]
      const last  = focusable[focusable.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      previouslyFocused?.focus()
    }
  }, [onCancel])

  return (
    // Overlay
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onCancel}
    >
      {/* Modal */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={messageId}
        className="bg-background-card border border-border rounded-2xl p-6 w-full max-w-sm mx-4 shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            {danger && (
              <div className="w-9 h-9 rounded-full bg-accent-red/10 flex items-center justify-center shrink-0">
                <AlertTriangle size={16} className="text-accent-red" />
              </div>
            )}
            <h3 id={titleId} className="font-semibold text-base">{title}</h3>
          </div>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Cerrar"
            className="text-gray-500 hover:text-white transition-colors p-1 -mt-1 -mr-1"
          >
            <X size={16} />
          </button>
        </div>

        {/* Message */}
        <p id={messageId} className="text-sm text-gray-400 leading-relaxed mb-6">{message}</p>

        {/* Buttons */}
        <div className="flex gap-3 justify-end">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-sm text-gray-400 hover:text-white bg-background-tertiary hover:bg-border rounded-lg transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              danger
                ? 'bg-accent-red hover:bg-accent-red/80 text-white'
                : 'bg-accent-blue hover:bg-accent-blue/80 text-white'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
