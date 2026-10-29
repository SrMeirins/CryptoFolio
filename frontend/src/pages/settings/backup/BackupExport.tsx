import { useState } from 'react'
import { AlertTriangle, Download, Lock, RefreshCw } from 'lucide-react'
import { backupApi } from '../../../api/backup'
import { Field, Switch, buttonClasses, fieldClasses } from '../../../components/ui'
import { useToast } from '../../../hooks/useToast'
import { backupFilename } from '../../../constants/appInfo'
import { downloadJson, exportPasswordError } from '../../../utils/backupFile'

// Exportar una copia (#453): cifrada con contraseña por defecto. Sin cifrar,
// un aviso claro de que el fichero se puede leer tal cual.
export function BackupExport() {
  const toast = useToast()
  const [encrypt, setEncrypt] = useState(true)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [touched, setTouched] = useState(false)
  const [exporting, setExporting] = useState(false)
  const error = encrypt ? exportPasswordError(password, confirm) : null

  async function handleExport(e: React.FormEvent) {
    e.preventDefault()
    setTouched(true)
    if (error) return
    setExporting(true)
    try {
      downloadJson(await backupApi.export(encrypt ? password : undefined), backupFilename())
      toast.success(encrypt ? 'Copia cifrada descargada' : 'Copia descargada', encrypt ? 'Guarda la contraseña: sin ella no se puede restaurar.' : undefined)
      setPassword('')
      setConfirm('')
      setTouched(false)
    } catch (err) {
      toast.error('No se pudo exportar', (err as Error).message)
    } finally {
      setExporting(false)
    }
  }

  return (
    <form onSubmit={handleExport} noValidate className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <label htmlFor="copia-cifrar" className="text-sm font-medium">Cifrar con contraseña</label>
          <p id="copia-cifrar-hint" className="text-xs text-fg-subtle mt-0.5">La contraseña no se guarda: sin ella no se puede recuperar la copia.</p>
        </div>
        <Switch id="copia-cifrar" checked={encrypt} onChange={setEncrypt} describedBy="copia-cifrar-hint" />
      </div>

      {encrypt ? (
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Contraseña" hint="Al menos 8 caracteres.">
            {p => <input {...p} type="password" autoComplete="new-password" value={password} maxLength={1024}
              onChange={e => setPassword(e.target.value)} className={fieldClasses('md')} />}
          </Field>
          <Field label="Repite la contraseña" error={touched ? error : null}>
            {p => <input {...p} type="password" autoComplete="new-password" value={confirm} maxLength={1024}
              onChange={e => setConfirm(e.target.value)} className={fieldClasses('md', Boolean(touched && error))} />}
          </Field>
        </div>
      ) : (
        <p role="note" className="flex items-start gap-2 px-3 py-2.5 rounded-lg border border-warning/40 bg-warning/8 text-xs text-fg-muted">
          <AlertTriangle size={14} aria-hidden="true" className="text-warning-ink shrink-0 mt-px" />
          <span>Sin cifrar, el fichero contiene tus operaciones, saldos y direcciones en texto legible. Guárdalo en un sitio seguro.</span>
        </p>
      )}

      <div className="flex justify-end">
        <button type="submit" disabled={exporting} className={buttonClasses('primary', 'md', 'flex')}>
          {exporting ? <RefreshCw size={13} aria-hidden="true" className="animate-spin" /> : encrypt ? <Lock size={13} aria-hidden="true" /> : <Download size={13} aria-hidden="true" />}
          {exporting ? 'Preparando...' : encrypt ? 'Descargar copia cifrada' : 'Descargar copia'}
        </button>
      </div>
    </form>
  )
}
