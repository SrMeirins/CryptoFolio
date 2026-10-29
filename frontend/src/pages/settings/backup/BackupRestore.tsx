import { useId, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { FileUp, Lock, RefreshCw, RotateCcw, X } from 'lucide-react'
import { backupApi, type BackupPreview } from '../../../api/backup'
import { ApiError } from '../../../api/client'
import { ConfirmDialog } from '../../../components/ConfirmDialog'
import { Field, buttonClasses, fieldClasses, iconButtonClasses } from '../../../components/ui'
import { useToast } from '../../../hooks/useToast'
import { formatBackupDate, readBackupFile } from '../../../utils/backupFile'
import { BackupPreviewTable } from './BackupPreviewTable'
import { useRevertSnapshot } from './useRevertSnapshot'

// Restaurar una copia (#453): elegir el fichero, la contraseña si está
// cifrada, revisar qué trae y confirmar. El servidor guarda antes el estado
// actual; el aviso final permite volver a él al momento.

interface Chosen { name: string; backup: unknown; encrypted: boolean; exportedAt: string }

export function BackupRestore() {
  const queryClient = useQueryClient()
  const toast = useToast()
  const { revert } = useRevertSnapshot()
  const inputId = useId()
  const fileRef = useRef<HTMLInputElement>(null)
  const [chosen, setChosen] = useState<Chosen | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  const [password, setPassword] = useState('')
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [preview, setPreview] = useState<BackupPreview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<'preview' | 'restore' | null>(null)
  const [confirming, setConfirming] = useState(false)

  function reset() {
    setChosen(null); setPreview(null); setPassword(''); setPasswordError(null); setError(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  async function onFile(file: File | undefined) {
    reset()
    setFileError(null)
    if (!file) return
    const result = await readBackupFile(file)
    if (!result.ok) { setFileError(result.error); return }
    setChosen({ name: file.name, backup: result.backup, encrypted: result.encrypted, exportedAt: result.exportedAt })
  }

  function explain(err: unknown) {
    if (err instanceof ApiError && (err.body as { code?: string } | null)?.code === 'contrasena') {
      setPasswordError(err.message)
      return
    }
    setError((err as Error).message)
  }

  async function handlePreview(e: React.FormEvent) {
    e.preventDefault()
    if (!chosen) return
    setPasswordError(null); setError(null); setBusy('preview')
    try {
      setPreview(await backupApi.preview(chosen.backup, chosen.encrypted ? password : undefined))
    } catch (err) {
      explain(err)
    } finally { setBusy(null) }
  }

  async function handleRestore() {
    if (!chosen) return
    setConfirming(false); setBusy('restore')
    try {
      const result = await backupApi.restore(chosen.backup, chosen.encrypted ? password : undefined)
      await queryClient.invalidateQueries({ refetchType: 'all' })
      reset()
      toast.addToast({
        type: 'success', title: 'Copia restaurada', duration: 12000,
        message: result.fifo ? 'Se han recalculado los lotes FIFO.' : 'Re-ejecuta el motor FIFO desde Mantenimiento.',
        action: { label: 'Deshacer', onClick: () => void revert(result.snapshotId) },
      })
    } catch (err) {
      explain(err)
    } finally { setBusy(null) }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <p className="text-sm font-medium">Restaurar desde un fichero</p>
          <p className="text-xs text-fg-subtle mt-0.5">Sustituye todos los datos. Antes se guarda el estado actual para poder volver.</p>
        </div>
        <input ref={fileRef} id={inputId} type="file" accept="application/json,.json" className="sr-only"
          onChange={e => void onFile(e.target.files?.[0])} />
        <label htmlFor={inputId}
          className={buttonClasses('secondary', 'md', 'flex cursor-pointer has-focus-visible:ring-2 has-focus-visible:ring-brand/60')}>
          <FileUp size={13} aria-hidden="true" /> Elegir copia
        </label>
      </div>

      {fileError && <p role="alert" className="text-xs text-negative-ink">{fileError}</p>}

      {chosen && (
        <form onSubmit={handlePreview} noValidate aria-label="Copia elegida"
          className="space-y-3 px-4 py-3 rounded-xl border border-border bg-overlay/3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium truncate flex items-center gap-1.5">
                {chosen.encrypted && <Lock size={12} aria-hidden="true" className="text-brand-ink shrink-0" />}
                {chosen.name}
              </p>
              <p className="text-xs text-fg-subtle">
                Exportada el {formatBackupDate(chosen.exportedAt)}{chosen.encrypted ? ', cifrada' : ', sin cifrar'}
              </p>
            </div>
            <button type="button" onClick={reset} aria-label="Descartar la copia elegida" className={iconButtonClasses('sm')}>
              <X size={13} aria-hidden="true" />
            </button>
          </div>

          {chosen.encrypted && !preview && (
            <Field label="Contraseña de la copia" error={passwordError}>
              {p => <input {...p} type="password" autoComplete="current-password" value={password} maxLength={1024}
                onChange={e => setPassword(e.target.value)} className={fieldClasses('md', Boolean(passwordError))} />}
            </Field>
          )}

          {preview && <BackupPreviewTable preview={preview} />}
          {error && <p role="alert" className="text-xs text-negative-ink">{error}</p>}

          <div className="flex justify-end gap-2">
            {!preview ? (
              <button type="submit" disabled={busy !== null || (chosen.encrypted && !password)} className={buttonClasses('secondary', 'md', 'flex')}>
                {busy === 'preview' && <RefreshCw size={13} aria-hidden="true" className="animate-spin" />}
                {busy === 'preview' ? 'Comprobando...' : 'Revisar contenido'}
              </button>
            ) : (
              <button type="button" onClick={() => setConfirming(true)} disabled={busy !== null} className={buttonClasses('danger', 'md', 'flex')}>
                {busy === 'restore' ? <RefreshCw size={13} aria-hidden="true" className="animate-spin" /> : <RotateCcw size={13} aria-hidden="true" />}
                {busy === 'restore' ? 'Restaurando...' : 'Restaurar esta copia'}
              </button>
            )}
          </div>
        </form>
      )}

      {confirming && chosen && (
        <ConfirmDialog danger title="Restaurar la copia"
          message={`Se sustituirán todos los datos por los de la copia del ${formatBackupDate(chosen.exportedAt)}. Antes se guarda el estado actual y podrás volver a él.`}
          confirmLabel="Restaurar" onConfirm={() => void handleRestore()} onCancel={() => setConfirming(false)} />
      )}
    </div>
  )
}
