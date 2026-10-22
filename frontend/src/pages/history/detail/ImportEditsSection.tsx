import { useEffect, useRef, useState } from 'react'
import { RefreshCw, RotateCcw } from 'lucide-react'
import type { Transaction } from '../../../api/portfolio'
import { buttonClasses } from '../../../components/ui'
import { importDiff } from './importDiff'

// Cambios de una importada editada a mano (#378): cada campo con su valor
// importado y el actual, y «Restaurar original» con confirmación en línea
// (el foco va a «Cancelar», la opción segura; Esc cancela).

function RestoreConfirm({ onConfirm, onCancel, restoring }: { onConfirm: () => void; onCancel: () => void; restoring: boolean }) {
  const cancelRef = useRef<HTMLButtonElement>(null)
  useEffect(() => { cancelRef.current?.focus() }, [])
  return (
    <div role="group" aria-label="Confirmar la restauración de los valores importados" className="flex flex-wrap items-center gap-1.5"
      onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); onCancel() } }}>
      <span className="text-xs text-fg-muted">Se perderán tus cambios (salvo las notas) y se recalculará el FIFO.</span>
      <button type="button" onClick={onConfirm} disabled={restoring} className={buttonClasses('danger', 'sm', 'px-2 py-0.5 text-xs')}>
        {restoring && <RefreshCw size={11} aria-hidden="true" className="animate-spin" />}
        {restoring ? 'Restaurando…' : 'Restaurar'}
      </button>
      <button type="button" ref={cancelRef} onClick={onCancel} disabled={restoring} className={buttonClasses('ghost', 'sm', 'px-2 py-0.5 text-xs')}>
        Cancelar
      </button>
    </div>
  )
}

export function ImportEditsSection({ tx, walletName, onRestore, restoring }: {
  tx: Transaction
  walletName: (id: string) => string | undefined
  onRestore: (id: string) => void
  restoring: boolean
}) {
  const [confirming, setConfirming] = useState(false)
  const restoreRef = useRef<HTMLButtonElement>(null)
  if (!tx.original_import) return null
  const rows = importDiff(tx, tx.original_import, walletName)

  function cancel() {
    setConfirming(false)
    requestAnimationFrame(() => restoreRef.current?.focus())
  }

  return (
    <div className="space-y-2 text-xs">
      <p className="text-fg-muted">Has editado esta transacción importada. Valores del archivo frente a los actuales:</p>
      {rows.length > 0 ? (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full">
            <caption className="sr-only">Cambios respecto a los valores importados</caption>
            <thead className="text-fg-subtle">
              <tr>
                <th scope="col" className="text-left font-medium px-2 py-1">Campo</th>
                <th scope="col" className="text-left font-medium px-2 py-1">Importado</th>
                <th scope="col" className="text-left font-medium px-2 py-1">Actual</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.field} className="border-t border-border/60">
                  <th scope="row" className="text-left font-normal text-fg-muted px-2 py-1">{r.label}</th>
                  <td className="px-2 py-1 mono text-fg-subtle line-through decoration-fg-subtle/60">{r.before}</td>
                  <td className="px-2 py-1 mono text-fg">{r.after}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-fg-subtle">Sin diferencias visibles en los campos mostrados.</p>
      )}
      {confirming ? (
        <RestoreConfirm onConfirm={() => onRestore(tx.id)} onCancel={cancel} restoring={restoring} />
      ) : (
        <button type="button" ref={restoreRef} onClick={() => setConfirming(true)} className={buttonClasses('ghost', 'sm', 'text-xs')}>
          <RotateCcw size={12} aria-hidden="true" /> Restaurar original
        </button>
      )}
    </div>
  )
}
