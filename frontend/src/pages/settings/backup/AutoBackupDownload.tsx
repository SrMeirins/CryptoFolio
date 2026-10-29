import { useId, useRef, useState } from 'react'
import { Lock, RefreshCw } from 'lucide-react'
import { backupApi } from '../../../api/backup'
import { Field, Modal, ModalBody, ModalFooter, ModalHeader, buttonClasses, fieldClasses } from '../../../components/ui'
import { useToast } from '../../../hooks/useToast'
import { backupFilename } from '../../../constants/appInfo'
import { downloadJson, exportPasswordError, formatBackupDate } from '../../../utils/backupFile'

// Descargar una copia automática (#454): se recifra con una contraseña para
// poder restaurarla en otro equipo (la clave del equipo no sale de aquí).
export function AutoBackupDownload({ name, createdAt, onClose }: { name: string; createdAt: string; onClose: () => void }) {
  const toast = useToast()
  const titleId = useId()
  const firstRef = useRef<HTMLInputElement>(null)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [touched, setTouched] = useState(false)
  const [busy, setBusy] = useState(false)
  const error = exportPasswordError(password, confirm)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setTouched(true)
    if (error) return
    setBusy(true)
    try {
      downloadJson(await backupApi.autoDownload(name, password), backupFilename(new Date(createdAt)))
      toast.success('Copia descargada', 'Cifrada con tu contraseña: guárdala, sin ella no se puede restaurar.')
      onClose()
    } catch (err) {
      toast.error('No se pudo descargar', (err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal onClose={onClose} labelledBy={titleId} size="sm" initialFocusRef={firstRef}>
      <form onSubmit={submit} noValidate className="flex flex-col min-h-0">
        <ModalHeader titleId={titleId} title="Descargar copia" subtitle={`Del ${formatBackupDate(createdAt)}`} onClose={onClose} />
        <ModalBody className="space-y-3">
          <p className="text-xs text-fg-muted">Se descarga cifrada con esta contraseña, que no se guarda. Con ella podrás restaurarla en cualquier equipo.</p>
          <Field label="Contraseña" hint="Al menos 8 caracteres.">
            {p => <input {...p} ref={firstRef} type="password" autoComplete="new-password" value={password} maxLength={1024}
              onChange={e => setPassword(e.target.value)} className={fieldClasses('md')} />}
          </Field>
          <Field label="Repite la contraseña" error={touched ? error : null}>
            {p => <input {...p} type="password" autoComplete="new-password" value={confirm} maxLength={1024}
              onChange={e => setConfirm(e.target.value)} className={fieldClasses('md', Boolean(touched && error))} />}
          </Field>
        </ModalBody>
        <ModalFooter>
          <button type="button" onClick={onClose} className={buttonClasses('ghost', 'md')}>Cancelar</button>
          <button type="submit" disabled={busy} className={buttonClasses('primary', 'md', 'flex')}>
            {busy ? <RefreshCw size={13} aria-hidden="true" className="animate-spin" /> : <Lock size={13} aria-hidden="true" />}
            {busy ? 'Preparando...' : 'Descargar cifrada'}
          </button>
        </ModalFooter>
      </form>
    </Modal>
  )
}
