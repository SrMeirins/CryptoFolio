import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, CalendarClock, RefreshCw, Save } from 'lucide-react'
import { backupApi, type AutoBackupStatus, type AutoBackupUnavailable } from '../../../api/backup'
import { portfolioApi } from '../../../api/portfolio'
import { Dropdown, Switch, buttonClasses } from '../../../components/ui'
import { useSettingFeedback } from '../../../hooks/useSettingFeedback'
import { useToast } from '../../../hooks/useToast'
import { formatBackupDate } from '../../../utils/backupFile'
import { SettingsCard } from '../SettingsCard'
import { SavedMark } from '../SavedMark'
import { AutoBackupList } from './AutoBackupList'

// Copias automáticas en Datos (#454): activarlas, cada cuánto y cuántas se
// guardan (al momento, con Deshacer), hacer una ahora y la lista de las que hay.

const ENABLED_KEY = 'auto_backup_enabled'
const FREQUENCY_KEY = 'auto_backup_frequency'
const KEEP_KEY = 'auto_backup_keep'

const FREQUENCIES = [
  { value: 12, label: 'Cada 12 horas' },
  { value: 24, label: 'Diaria' },
  { value: 168, label: 'Semanal' },
] as const
const KEEP_OPTIONS = [3, 5, 7, 10, 14, 21, 30] as const

const UNAVAILABLE: Record<AutoBackupUnavailable, string> = {
  'sin-carpeta': 'Este equipo no tiene carpeta de copias configurada (AUTO_BACKUP_DIR).',
  'sin-clave': 'Falta la clave del equipo (WALLET_SYNC_ENCRYPTION_KEY). Sin ella las copias no se pueden cifrar y no se guardan en claro.',
}

function Row({ label, hint, htmlFor, children }: { label: string; hint?: string; htmlFor?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5 border-b border-border/50 flex-wrap">
      <div className="min-w-0 flex-1">
        {htmlFor ? <label htmlFor={htmlFor} className="text-sm font-medium">{label}</label> : <p className="text-sm font-medium">{label}</p>}
        {hint && <p className="text-xs text-fg-subtle mt-0.5">{hint}</p>}
      </div>
      {children}
    </div>
  )
}

export function AutoBackupCard({ index = 0 }: { index?: number }) {
  const queryClient = useQueryClient()
  const toast = useToast()
  const { saved, confirm } = useSettingFeedback()
  const { data: status } = useQuery({ queryKey: ['backup-auto'], queryFn: backupApi.auto, refetchInterval: 60_000 })
  const [running, setRunning] = useState(false)
  const settings = status?.settings ?? { enabled: true, frequencyHours: 24, keep: 7 }
  // El valor guardado en el momento de aplicar (Deshacer llega más tarde).
  const current = () => queryClient.getQueryData<AutoBackupStatus>(['backup-auto'])?.settings ?? settings

  async function save(key: string, value: string, message: string, previous: string, undoable = true) {
    try {
      await portfolioApi.setConfig(key, value)
      await queryClient.invalidateQueries({ queryKey: ['backup-auto'] })
      await queryClient.invalidateQueries({ queryKey: ['config'] })
      confirm(key, message, undoable ? () => void save(key, previous, 'Valor anterior restaurado', value, false) : undefined)
    } catch (e) {
      toast.error('No se pudo guardar', (e as Error).message)
    }
  }

  async function runNow() {
    setRunning(true)
    try {
      await backupApi.autoRun()
      toast.success('Copia hecha', 'Cifrada con la clave de este equipo.')
    } catch (e) {
      toast.error('No se pudo hacer la copia', (e as Error).message)
    } finally {
      await queryClient.invalidateQueries({ queryKey: ['backup-auto'] })
      await queryClient.invalidateQueries({ queryKey: ['settings-stats'] })
      await queryClient.invalidateQueries({ queryKey: ['notifications'] })
      setRunning(false)
    }
  }

  const keepOptions = (KEEP_OPTIONS as readonly number[]).includes(settings.keep) ? KEEP_OPTIONS : [...KEEP_OPTIONS, settings.keep].sort((a, b) => a - b)
  const last = status?.files[0]

  return (
    <SettingsCard index={index} icon={CalendarClock} title="Copias automáticas"
      status={<><SavedMark stamp={saved} id={ENABLED_KEY} /><SavedMark stamp={saved} id={FREQUENCY_KEY} /><SavedMark stamp={saved} id={KEEP_KEY} /></>}
      description="Cifradas con la clave de este equipo: solo se abren aquí. Para llevar una a otro equipo, descárgala con una contraseña."
      action={status?.available && (
        <button type="button" onClick={() => void runNow()} disabled={running} className={buttonClasses('secondary', 'sm', 'flex')}>
          {running ? <RefreshCw size={12} aria-hidden="true" className="animate-spin" /> : <Save size={12} aria-hidden="true" />}
          {running ? 'Haciendo copia...' : 'Hacer copia ahora'}
        </button>
      )}>
      {status && !status.available && status.reason && (
        <p role="note" className="flex items-start gap-2 px-3 py-2.5 rounded-lg border border-warning/40 bg-warning/8 text-xs text-fg-muted">
          <AlertTriangle size={14} aria-hidden="true" className="text-warning-ink shrink-0 mt-px" />
          <span>{UNAVAILABLE[status.reason]}</span>
        </p>
      )}
      {status?.lastFailure && (
        <p role="alert" className="flex items-start gap-2 px-3 py-2.5 rounded-lg border border-negative/40 bg-negative/8 text-xs text-fg-muted">
          <AlertTriangle size={14} aria-hidden="true" className="text-negative-ink shrink-0 mt-px" />
          <span>Falló la copia del {formatBackupDate(status.lastFailure.at)}: {status.lastFailure.message} Las anteriores se conservan.</span>
        </p>
      )}

      <div>
        <Row label="Hacer copias automáticas" htmlFor="copias-auto"
          hint={last ? `Última: ${formatBackupDate(last.created_at)}` : 'Aún no se ha hecho ninguna.'}>
          <Switch id="copias-auto" checked={settings.enabled} disabled={!status?.available}
            onChange={on => void save(ENABLED_KEY, String(on), on ? 'Copias automáticas activadas' : 'Copias automáticas desactivadas', String(current().enabled))} />
        </Row>
        <Row label="Frecuencia">
          <Dropdown label="Frecuencia de las copias" value={settings.frequencyHours} disabled={!status?.available || !settings.enabled}
            options={FREQUENCIES.map(f => ({ value: f.value, label: f.label }))}
            onChange={v => {
              const label = FREQUENCIES.find(f => f.value === v)?.label ?? ''
              void save(FREQUENCY_KEY, String(v), `Frecuencia: ${label.toLowerCase()}`, String(current().frequencyHours))
            }} />
        </Row>
        <Row label="Copias que se guardan" hint="Al hacer una nueva, se borra la más antigua que sobre.">
          <Dropdown label="Copias que se guardan" value={settings.keep} disabled={!status?.available || !settings.enabled}
            options={keepOptions.map(n => ({ value: n, label: `${n} copias` }))}
            onChange={v => void save(KEEP_KEY, String(v), `Se guardan las ${v} últimas copias`, String(current().keep))} />
        </Row>
      </div>

      {status?.available && <AutoBackupList files={status.files} />}
    </SettingsCard>
  )
}
