import { useRef, useId } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Button, Modal, ModalHeader } from './ui'

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
  // Foco inicial siempre al botón cancelar (nunca al de confirmar, aunque
  // no sea "danger") — evita que un Enter accidental dispare la acción.
  const cancelRef = useRef<HTMLButtonElement>(null)

  return (
    <Modal onClose={onCancel} labelledBy={titleId} describedBy={messageId} size="sm" initialFocusRef={cancelRef}>
      <ModalHeader
        titleId={titleId}
        title={title}
        onClose={onCancel}
        className="border-b-0 pb-0"
        icon={danger && (
          <div className="w-9 h-9 rounded-full bg-negative/10 flex items-center justify-center shrink-0">
            <AlertTriangle size={16} className="text-negative" />
          </div>
        )}
      />
      <p id={messageId} className="px-5 pt-3 text-sm text-fg-muted leading-relaxed">{message}</p>
      <div className="flex gap-3 justify-end p-5">
        <Button ref={cancelRef} variant="ghost" onClick={onCancel}>{cancelLabel}</Button>
        <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm}>{confirmLabel}</Button>
      </div>
    </Modal>
  )
}
