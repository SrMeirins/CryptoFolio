import { useId, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle } from 'lucide-react'
import { portfolioApi } from '../../api/portfolio'
import { ApiError } from '../../api/client'
import { Dropdown, Modal, ModalHeader, buttonClasses, cardClasses } from '../../components/ui'
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

export function TimezoneSetting() {
  const queryClient = useQueryClient()
  const toast = useToast()
  const titleId = useId()
  const [pending, setPending] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const { data: info } = useQuery({ queryKey: TIMEZONE_QUERY_KEY, queryFn: portfolioApi.getTimezone })
  const { data: declaraciones = [] } = useQuery({ queryKey: ['fiscal-declaraciones'], queryFn: portfolioApi.getDeclaraciones })
  const system = systemTimezone()
  const options = useMemo(() => timezoneOptions(allTimezones(), system), [system])

  async function apply(value: string) {
    setPending(null)
    setSaving(true)
    try {
      await portfolioApi.setConfig('timezone', value)
      // Todo lo que depende de la zona (días, ejercicios, cierres) se vuelve a pedir.
      await queryClient.invalidateQueries()
      toast.success('Zona horaria actualizada', value ? `Días y horas en ${timezoneLabel(value)}` : 'Se usa la zona predeterminada')
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
    <div className={cardClasses('md')}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-sm">Zona horaria</h3>
          <p className="text-xs text-fg-subtle mt-0.5 leading-relaxed">
            Decide el día de cada operación, el ejercicio fiscal, los cierres diarios del P&amp;L y las horas que ves.
            Ahora: <span className="text-fg font-medium">{timezoneLabel(info.timezone)}</span> ({info.timezone}, {SOURCE_TEXT[info.source]}).
          </p>
          {info.invalidSetting && (
            <p role="alert" className="mt-2 flex items-start gap-1.5 text-xs text-warning-ink">
              <AlertTriangle size={13} aria-hidden="true" className="shrink-0 mt-px" />
              <span>La zona guardada («{info.invalidSetting}») no es válida y se ignora. Elige otra.</span>
            </p>
          )}
        </div>
        <Dropdown label="Zona horaria" value={info.timezone} onChange={v => request(v)} options={options} searchable disabled={saving} className="w-64" />
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
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
    </div>
  )
}
