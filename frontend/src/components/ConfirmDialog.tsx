import { useRef, useId } from 'react'
import { AlertTriangle, X } from 'lucide-react'
import { useModalA11y } from '../hooks/useModalA11y'
import { cardClasses, iconButtonClasses } from './ui'

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
  const cancelRef = useRef<HTMLButtonElement>(null)
  // Foco inicial siempre al botón cancelar (nunca al de confirmar, aunque
  // no sea "danger") — evita que un Enter accidental dispare la acción.
  const dialogRef = useModalA11y<HTMLDivElement>(onCancel, cancelRef)

  return (
    // Overlay
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs"
      onClick={onCancel}
    >
      {/* Modal */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={messageId}
        className={cardClasses('none', 'p-6 w-full max-w-sm mx-4 shadow-2xl')}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            {danger && (
              <div className="w-9 h-9 rounded-full bg-negative/10 flex items-center justify-center shrink-0">
                <AlertTriangle size={16} className="text-negative" />
              </div>
            )}
            <h3 id={titleId} className="font-semibold text-base">{title}</h3>
          </div>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Cerrar"
            className={iconButtonClasses('sm', false, '-mt-1 -mr-1')}
          >
            <X size={16} />
          </button>
        </div>

        {/* Message */}
        <p id={messageId} className="text-sm text-fg-muted leading-relaxed mb-6">{message}</p>

        {/* Buttons */}
        <div className="flex gap-3 justify-end">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-sm text-fg-muted hover:text-fg bg-background-tertiary hover:bg-border rounded-lg transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              danger
                ? 'bg-negative hover:bg-negative/90 text-on-negative'
                : 'bg-brand-solid hover:bg-brand-solid/90 text-on-brand'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
