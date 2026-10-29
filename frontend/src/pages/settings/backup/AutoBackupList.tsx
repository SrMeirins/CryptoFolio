import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Download, RotateCcw } from 'lucide-react'
import { backupApi, type AutoBackupFile } from '../../../api/backup'
import { ConfirmDialog } from '../../../components/ConfirmDialog'
import { iconButtonClasses } from '../../../components/ui'
import { useToast } from '../../../hooks/useToast'
import { formatBackupDate, formatBytes } from '../../../utils/backupFile'
import { AutoBackupDownload } from './AutoBackupDownload'
import { useRevertSnapshot } from './useRevertSnapshot'

// Lista de copias automáticas (#454), de la más reciente a la más antigua:
// descargar (recifrada con contraseña) o restaurar tras confirmar.
export function AutoBackupList({ files }: { files: readonly AutoBackupFile[] }) {
  const queryClient = useQueryClient()
  const toast = useToast()
  const { revert } = useRevertSnapshot()
  const [downloading, setDownloading] = useState<AutoBackupFile | null>(null)
  const [restoring, setRestoring] = useState<AutoBackupFile | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  async function restore(file: AutoBackupFile) {
    setRestoring(null)
    setBusy(file.name)
    try {
      const result = await backupApi.autoRestore(file.name)
      await queryClient.invalidateQueries({ refetchType: 'all' })
      toast.addToast({
        type: 'success', title: 'Copia restaurada', duration: 12000,
        message: result.fifo ? 'Se han recalculado los lotes FIFO.' : 'Re-ejecuta el motor FIFO desde Mantenimiento.',
        action: { label: 'Deshacer', onClick: () => void revert(result.snapshotId) },
      })
    } catch (err) {
      toast.error('No se pudo restaurar', (err as Error).message)
    } finally {
      setBusy(null)
    }
  }

  if (files.length === 0) return <p className="text-xs text-fg-subtle">Aún no hay copias automáticas.</p>

  return (
    <>
      <ul aria-label="Copias automáticas" className="divide-y divide-border/50 rounded-xl border border-border">
        {files.map((f, i) => (
          <li key={f.name} data-copia={f.name} className="flex items-center justify-between gap-3 px-3 py-2">
            <div className="min-w-0">
              <p className="text-sm">
                {formatBackupDate(f.created_at)}
                {i === 0 && <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded-md bg-brand/10 text-brand-ink">Última</span>}
              </p>
              <p className="text-xs text-fg-subtle mono">{formatBytes(f.size)}</p>
            </div>
            <div className="flex items-center gap-0.5">
              <button type="button" onClick={() => setDownloading(f)} disabled={busy !== null}
                aria-label={`Descargar la copia del ${formatBackupDate(f.created_at)}`} className={iconButtonClasses('md')}>
                <Download size={14} aria-hidden="true" />
              </button>
              <button type="button" onClick={() => setRestoring(f)} disabled={busy !== null}
                aria-label={`Restaurar la copia del ${formatBackupDate(f.created_at)}`} className={iconButtonClasses('md', false, '', 'danger')}>
                <RotateCcw size={14} aria-hidden="true" className={busy === f.name ? 'animate-spin' : ''} />
              </button>
            </div>
          </li>
        ))}
      </ul>
      {downloading && <AutoBackupDownload name={downloading.name} createdAt={downloading.created_at} onClose={() => setDownloading(null)} />}
      {restoring && (
        <ConfirmDialog danger title="Restaurar la copia automática"
          message={`Se sustituirán todos los datos por los de la copia del ${formatBackupDate(restoring.created_at)}. Antes se guarda el estado actual y podrás volver a él.`}
          confirmLabel="Restaurar" onConfirm={() => void restore(restoring)} onCancel={() => setRestoring(null)} />
      )}
    </>
  )
}
