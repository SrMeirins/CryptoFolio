import { useState } from 'react'
import { History, RefreshCw } from 'lucide-react'
import type { BackupSnapshot } from '../../../api/backup'
import { ConfirmDialog } from '../../../components/ConfirmDialog'
import { buttonClasses } from '../../../components/ui'
import { formatNumber } from '../../../utils/format'
import { formatBackupDate } from '../../../utils/backupFile'
import { useRevertSnapshot } from './useRevertSnapshot'

// El estado guardado antes de la última restauración (#453), con la opción
// de volver a él. Solo aparece si hay alguno.
export function PreviousState({ snapshot }: { snapshot: BackupSnapshot }) {
  const { reverting, revert } = useRevertSnapshot()
  const [confirming, setConfirming] = useState(false)
  const ops = snapshot.counts.transactions ?? 0

  return (
    <div className="flex items-center justify-between gap-3 flex-wrap pt-3 border-t border-border/50">
      <div>
        <p className="text-sm font-medium flex items-center gap-1.5"><History size={13} aria-hidden="true" className="text-fg-subtle" /> Estado anterior</p>
        <p className="text-xs text-fg-subtle mt-0.5">
          Guardado el {formatBackupDate(snapshot.created_at)} antes de restaurar, con {formatNumber(ops, 0)} {ops === 1 ? 'operación' : 'operaciones'}.
        </p>
      </div>
      <button type="button" onClick={() => setConfirming(true)} disabled={reverting} className={buttonClasses('secondary', 'md', 'flex')}>
        {reverting && <RefreshCw size={13} aria-hidden="true" className="animate-spin" />}
        {reverting ? 'Volviendo...' : 'Volver al estado anterior'}
      </button>
      {confirming && (
        <ConfirmDialog danger title="Volver al estado anterior"
          message={`Los datos actuales se sustituirán por los guardados el ${formatBackupDate(snapshot.created_at)}. Si quieres conservarlos, exporta antes una copia.`}
          confirmLabel="Volver" onConfirm={() => { setConfirming(false); void revert(snapshot.id) }} onCancel={() => setConfirming(false)} />
      )}
    </div>
  )
}
