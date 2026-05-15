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
  return (
    // Overlay
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onCancel}
    >
      {/* Modal */}
      <div
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
            <h3 className="font-semibold text-base">{title}</h3>
          </div>
          <button
            onClick={onCancel}
            className="text-gray-500 hover:text-white transition-colors p-1 -mt-1 -mr-1"
          >
            <X size={16} />
          </button>
        </div>

        {/* Message */}
        <p className="text-sm text-gray-400 leading-relaxed mb-6">{message}</p>

        {/* Buttons */}
        <div className="flex gap-3 justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm text-gray-400 hover:text-white bg-background-tertiary hover:bg-border rounded-lg transition-colors"
          >
            {cancelLabel}
          </button>
          <button
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