import { useId, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Clock } from 'lucide-react'
import { portfolioApi } from '../../api/portfolio'
import { ApiError } from '../../api/client'
import { Dropdown, Modal, ModalHeader, buttonClasses } from '../../components/ui'
import { SettingsCard } from './SettingsCard'
import { SavedMark } from './SavedMark'
import { useSettingFeedback } from '../../hooks/useSettingFeedback'
import { useToast } from '../../hooks/useToast'
import { TIMEZONE_QUERY_KEY } from '../../hooks/useTimezoneSync'
import { allTimezones, systemTimezone, timezoneOptions } from '../../utils/timezoneOptions'
import { timezoneLabel } from '../../utils/timezoneLabel'

// Zona horaria de la aplicación en Ajustes (#390): días, meses, ejercicio
// fiscal y horas. Con ejercicios ya declarados se pide confirmación: sus
// cifras declaradas se conservan y Fiscal muestra las diferencias.

const SOURCE_TEXT = {
  ajuste: 'elegida aquí',
  variable: 'de la variable APP_TIMEZONE',
  defecto: 'la predeterminada',
} as const

export function TimezoneSetting({ index = 0 }: { index?: number }) {
  const queryClient = useQueryClient()
  const toast = useToast()
  // Guardado al momento con Deshacer (#445).
  const { saved, confirm } = useSettingFeedback()
  const titleId = useId()
  const [pending, setPending] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const { data: info } = useQuery({ queryKey: TIMEZONE_QUERY_KEY, queryFn: portfolioApi.getTimezone })
  const { data: declaraciones = [] } = useQuery({ queryKey: ['fiscal-declaraciones'], queryFn: portfolioApi.getDeclaraciones })
  const system = systemTimezone()
  const options = useMemo(() => timezoneOptions(allTimezones(), system), [system])

  /** `undoable`: al deshacer se vuelve a aplicar el valor anterior, sin ofrecer otro Deshacer. */
  async function apply(value: string, undoable = true) {
    // La zona guardada ahora, no la del render: Deshacer se ejecuta más tarde.
    const now = queryClient.getQueryData<typeof info>(TIMEZONE_QUERY_KEY)
    const previous = now?.source === 'ajuste' ? now.timezone : ''
    setPending(null)
    setSaving(true)
    try {
      await portfolioApi.setConfig('timezone', value)
      // Todo lo que depende de la zona (días, ejercicios, cierres) se vuelve a pedir.
      await queryClient.invalidateQueries()
      confirm('zona', value ? `Días y horas en ${timezoneLabel(value)}` : 'Se usa la zona predeterminada',
        undoable ? () => void apply(previous, false) : undefined)
    } catch (e) {
      toast.error('No se pudo cambiar la zona horaria', e instanceof ApiError ? e.message : (e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  /** Con ejercicios declarados, primero se confirma. */
  function request(value: string) {
    if (value === (info?.source === 'ajuste' ? info.timezone : '')) return
    if (declaraciones.length > 0) setPending(value)
    else void apply(value)
  }

  if (!info) return null
  const pendingLabel = pending === '' ? 'la zona predeterminada' : pending ? timezoneLabel(pending) : ''

  return (
    <SettingsCard index={index} icon={Clock} title="Zona horaria" status={<SavedMark stamp={saved} id="zona" />}
      description={<>
        Decide el día de cada operación, el ejercicio fiscal, los cierres diarios del P&amp;L y las horas que ves.
        Ahora: <span className="text-fg font-medium">{timezoneLabel(info.timezone)}</span> ({info.timezone}, {SOURCE_TEXT[info.source]}).
      </>}
      action={<Dropdown label="Zona horaria" value={info.timezone} onChange={v => request(v)} options={options} searchable disabled={saving} className="w-64" />}>
      {info.invalidSetting && (
        <p role="alert" className="flex items-start gap-1.5 text-xs text-warning-ink">
          <AlertTriangle size={13} aria-hidden="true" className="shrink-0 mt-px" />
          <span>La zona guardada («{info.invalidSetting}») no es válida y se ignora. Elige otra.</span>
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {system && system !== info.timezone && (
          <button type="button" onClick={() => request(system)} disabled={saving} className={buttonClasses('secondary', 'sm')}>
            Usar la del sistema ({timezoneLabel(system)})
          </button>
        )}
        {info.source === 'ajuste' && (
          <button type="button" onClick={() => request('')} disabled={saving} className={buttonClasses('ghost', 'sm')}>
            Volver a la predeterminada
          </button>
        )}
      </div>

      {pending !== null && (
        <Modal onClose={() => setPending(null)} labelledBy={titleId} size="sm">
          <ModalHeader titleId={titleId} title="Cambiar la zona horaria" onClose={() => setPending(null)} />
          <div className="px-6 py-4 space-y-3 text-sm">
            <p>
              Vas a pasar a <strong>{pendingLabel}</strong>. Las operaciones cerca de la medianoche pueden cambiar de día y, en Nochevieja, de ejercicio fiscal.
            </p>
            <p className="text-fg-muted">
              Tienes {declaraciones.length === 1 ? 'un ejercicio declarado' : `${declaraciones.length} ejercicios declarados`}: sus cifras declaradas se conservan y Fiscal te mostrará si las actuales difieren.
            </p>
          </div>
          <div className="flex justify-end gap-2 px-6 pb-5">
            <button type="button" onClick={() => setPending(null)} className={buttonClasses('ghost', 'sm')}>Cancelar</button>
            <button type="button" onClick={() => void apply(pending)} className={buttonClasses('primary', 'sm')}>Cambiar la zona</button>
          </div>
        </Modal>
      )}
    </SettingsCard>
  )
}
