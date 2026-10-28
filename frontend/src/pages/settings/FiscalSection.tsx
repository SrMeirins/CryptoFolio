import { useState, useMemo, type KeyboardEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { portfolioApi } from '../../api/portfolio'
import { AlertCircle, RotateCcw, Scale, Landmark, Percent, BellRing } from 'lucide-react'
import { TRAMOS_DEFAULT } from '../../utils/tramosIrpf'
import { SettingsCard } from './SettingsCard'
import { SavedMark } from './SavedMark'
import { useSettingFeedback } from '../../hooks/useSettingFeedback'
import { useToast } from '../../hooks/useToast'
import { validateRate, validateThreshold } from '../../utils/settingsValidation'
import { useCurrentFiscalBase } from '../../hooks/useCurrentFiscalBase'
import { preview721, previewCuota } from '../../utils/fiscalPreview'
import { NOTIFICATIONS_MUTED_KEY, mutedCategories } from '../../constants/notifications'
import { formatEur } from '../../utils/format'
import { formatNumber } from '../../utils/format'

/** Importe entero en euros con el símbolo detrás (#444). */
const formatEurInteger = (n: number) => `${formatNumber(n, 0)}\u00a0€`

const THRESHOLD_KEY = 'modelo721_threshold'
const TRAMOS_KEY = 'irpf_tramos_tipos'
const DEFAULT_TIPOS = TRAMOS_DEFAULT.map(t => t.tipo)

/** Tipos guardados en config, o los por defecto si no hay o son inválidos. */
function parseTipos(raw: string | undefined): number[] {
  if (!raw) return DEFAULT_TIPOS
  try {
    const arr = JSON.parse(raw)
    if (Array.isArray(arr) && arr.length === TRAMOS_DEFAULT.length) return arr
  } catch { /* noop */ }
  return DEFAULT_TIPOS
}

/** Enter guarda el campo como al salir de él. */
const blurOnEnter = (e: KeyboardEvent<HTMLInputElement>) => { if (e.key === 'Enter') e.currentTarget.blur() }

// Ajustes fiscales (#445): cada valor se guarda al salir del campo o con
// Enter, validado; un valor no válido muestra el motivo y conserva el anterior.
// Cada guardado ofrece Deshacer.
export function FiscalSection() {
  const { data: config = {} } = useQuery({ queryKey: ['config'], queryFn: portfolioApi.getConfig })
  const queryClient = useQueryClient()
  const toast = useToast()
  const { saved, confirm } = useSettingFeedback()

  // Valores guardados en el momento de aplicar, no los del render en que se
  // creó la función: Deshacer se ejecuta más tarde y debe comparar con el actual.
  const currentConfig = () => queryClient.getQueryData<Record<string, string>>(['config']) ?? {}

  async function saveConfig(key: string, value: string): Promise<boolean> {
    try {
      await portfolioApi.setConfig(key, value)
      await queryClient.invalidateQueries({ queryKey: ['config'] })
      return true
    } catch (e) {
      toast.error('No se pudo guardar', (e as Error).message)
      return false
    }
  }

  // ── Umbral del Modelo 721 ────────────────────────────────────────────────
  const threshold = parseInt(config[THRESHOLD_KEY] ?? '50000')
  // Borrador mientras se escribe; null muestra el valor guardado.
  const [thresholdDraft, setThresholdDraft] = useState<string | null>(null)
  const [thresholdError, setThresholdError] = useState<string | null>(null)
  const thresholdInput = thresholdDraft ?? String(threshold)

  async function applyThreshold(value: number, undoable = true) {
    const previous = parseInt(currentConfig()[THRESHOLD_KEY] ?? '50000')
    setThresholdDraft(null)
    setThresholdError(null)
    if (value === previous) return
    if (await saveConfig(THRESHOLD_KEY, String(value))) {
      confirm('umbral', `Umbral del Modelo 721: ${formatEurInteger(value)}`, undoable ? () => void applyThreshold(previous, false) : undefined)
    }
  }
  function commitThreshold() {
    if (thresholdDraft === null) return
    const v = validateThreshold(thresholdDraft)
    if (!v.ok) { setThresholdError(v.error); return }
    void applyThreshold(v.value)
  }

  // ── Tramos IRPF ──────────────────────────────────────────────────────────
  // Tipos guardados en config (o los por defecto si no hay o son inválidos).
  const storedTipos: number[] = useMemo(() => parseTipos(config[TRAMOS_KEY]), [config])
  const [rateDrafts, setRateDrafts] = useState<Record<number, string>>({})
  const [rateErrors, setRateErrors] = useState<Record<number, string>>({})

  async function applyTipos(tipos: number[], message: string, undoable = true) {
    const previous = parseTipos(currentConfig()[TRAMOS_KEY])
    setRateDrafts({})
    setRateErrors({})
    if (tipos.every((t, i) => t === previous[i])) return
    if (await saveConfig(TRAMOS_KEY, JSON.stringify(tipos))) {
      confirm('tramos', message, undoable ? () => void applyTipos(previous, 'Tramos IRPF restaurados', false) : undefined)
    }
  }
  function commitRate(i: number) {
    const raw = rateDrafts[i]
    if (raw === undefined) return
    const v = validateRate(raw)
    if (!v.ok) { setRateErrors(e => ({ ...e, [i]: v.error })); return }
    const tipos = storedTipos.map((t, j) => (j === i ? v.value : t))
    void applyTipos(tipos, `${TRAMOS_DEFAULT[i].label}: ${formatNumber(v.value, 2)} %`)
  }
  const isDefault = storedTipos.every((t, i) => t === DEFAULT_TIPOS[i])

  // ── Vista previa (#451): efecto en el ejercicio más reciente antes de aplicar ──
  const fiscalBase = useCurrentFiscalBase()
  const draftTipos = storedTipos.map((t, i) => {
    const v = rateDrafts[i] !== undefined ? validateRate(rateDrafts[i]) : null
    return v && v.ok ? v.value : t
  })
  const tramosActuales = TRAMOS_DEFAULT.map((t, i) => ({ ...t, tipo: storedTipos[i] }))
  const cuota = fiscalBase ? previewCuota(fiscalBase.base, tramosActuales, draftTipos) : null
  const cambiaTipos = draftTipos.some((t, i) => t !== storedTipos[i])
  const draftThreshold = thresholdDraft !== null ? validateThreshold(thresholdDraft) : null
  const umbralPrevisto = draftThreshold && draftThreshold.ok ? draftThreshold.value : threshold
  const obligacion = fiscalBase ? preview721(fiscalBase.valor721, umbralPrevisto, fiscalBase.valorIncompleto) : null

  // ── Recordatorios (#451): los avisos de la categoría Fiscal (#447) ──
  const recordatorios = !mutedCategories(config[NOTIFICATIONS_MUTED_KEY]).includes('fiscal')
  async function setRecordatorios(on: boolean, undoable = true) {
    const now = mutedCategories(currentConfig()[NOTIFICATIONS_MUTED_KEY])
    const next = on ? now.filter(k => k !== 'fiscal') : [...new Set([...now, 'fiscal' as const])]
    if (await saveConfig(NOTIFICATIONS_MUTED_KEY, JSON.stringify(next))) {
      void queryClient.invalidateQueries({ queryKey: ['notifications'] })
      void queryClient.invalidateQueries({ queryKey: ['notifications-all'] })
      confirm('recordatorios', on ? 'Recordatorios de plazos activados' : 'Recordatorios de plazos silenciados', undoable ? () => void setRecordatorios(!on, false) : undefined)
    }
  }

  return (
    <div className="space-y-4 max-w-3xl">
      {/* Normativa (#451): lo que aplica la app, sin opciones que no se pueden elegir */}
      <SettingsCard index={0} icon={Scale} title="Normativa"
        description="Lo que aplica la app a tus cálculos. Hoy solo admite la residencia fiscal en España.">
        <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
          {[
            ['Residencia fiscal', 'España'],
            ['Método de cálculo', 'FIFO, el exigido por la AEAT'],
            ['Impuesto', 'IRPF, base del ahorro'],
            ['Modelos', 'Modelo 100 (Renta) y Modelo 721'],
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between gap-3 border-b border-border/50 py-1.5">
              <dt className="text-fg-subtle text-xs">{k}</dt><dd className="text-xs text-fg text-right">{v}</dd>
            </div>
          ))}
        </dl>
      </SettingsCard>

      {/* Umbral Modelo 721 */}
      <SettingsCard index={1} icon={Landmark} title="Umbral Modelo 721" status={<SavedMark stamp={saved} id="umbral" />}
        description="Importe a partir del cual existe obligación de presentar el Modelo 721 (criptoactivos en exchanges extranjeros).">
        <div className="flex items-center gap-2 flex-wrap">
          {[25000, 50000, 100000].map(preset => (
            <button key={preset} type="button" onClick={() => void applyThreshold(preset)} aria-pressed={threshold === preset}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand ${
                threshold === preset
                  ? 'border-brand bg-brand/10 text-brand-ink'
                  : 'border-border bg-background-tertiary text-fg-muted hover:border-fg-subtle hover:text-fg'
              }`}>
              {formatEurInteger(preset)}
            </button>
          ))}
          <span className="text-xs text-fg-subtle ml-1">o un valor propio:</span>
          <div className={`flex items-center bg-background-tertiary border rounded-lg overflow-hidden transition-colors ${thresholdError ? 'border-negative' : 'border-border focus-within:border-brand'}`}>
            <input type="text" inputMode="numeric" value={thresholdInput} aria-label="Umbral del Modelo 721 en euros"
              aria-invalid={!!thresholdError} aria-describedby={thresholdError ? 'umbral-error' : undefined}
              onChange={e => { setThresholdDraft(e.target.value.replace(/[^0-9]/g, '')); setThresholdError(null) }}
              onBlur={commitThreshold} onKeyDown={blurOnEnter}
              className="px-3 py-2 text-sm mono bg-transparent text-fg w-28 focus:outline-hidden" />
            <span className="px-3 py-2 text-sm text-fg-subtle border-l border-border bg-background-secondary">€</span>
          </div>
        </div>
        {thresholdError && (
          <p id="umbral-error" role="alert" className="text-xs text-negative-ink flex items-center gap-1">
            <AlertCircle size={11} aria-hidden="true" /> {thresholdError}. Se mantiene {formatEurInteger(threshold)}.
          </p>
        )}
        <p className="text-xs text-fg-subtle flex items-start gap-1.5">
          <AlertCircle size={11} aria-hidden="true" className="shrink-0 mt-0.5" />
          El umbral legal vigente es de {formatEurInteger(50000)}. Modifícalo solo si la normativa cambia.
        </p>
        {fiscalBase && obligacion && (
          <p aria-live="polite" className="text-xs rounded-lg bg-overlay/4 px-3 py-2 text-fg-muted">
            {fiscalBase.enCurso ? 'Hoy' : `A 31 de diciembre de ${fiscalBase.year}`} tienes <span className="mono text-fg">{formatEur(fiscalBase.valor721)}</span>{fiscalBase.valorIncompleto ? ' como mínimo' : ''} en exchanges.
            {' '}Con un umbral de {formatEurInteger(umbralPrevisto)}, {obligacion.obligado ? 'estarías obligado a presentar el Modelo 721' : 'no estarías obligado a presentarlo'}{obligacion.seguro ? '.' : ', a falta de algunos precios.'}
          </p>
        )}
      </SettingsCard>

      {/* Tramos IRPF */}
      <SettingsCard index={2} icon={Percent} title="Tramos IRPF de la base del ahorro" status={<SavedMark stamp={saved} id="tramos" />}
        description="Porcentajes aplicables a las ganancias patrimoniales. Los tramos en euros son fijos por ley."
        action={!isDefault && (
          <button type="button" onClick={() => void applyTipos(DEFAULT_TIPOS, 'Tramos IRPF por defecto')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-fg-subtle hover:text-fg border border-border hover:border-fg-subtle transition-all shrink-0 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand">
            <RotateCcw size={11} aria-hidden="true" /> Restaurar
          </button>
        )}>
        <div className="space-y-2">
          {TRAMOS_DEFAULT.map((t, i) => {
            const error = rateErrors[i]
            return (
              <div key={t.label} className="flex items-center gap-3 flex-wrap">
                <span className="text-xs text-fg-subtle w-44 shrink-0">{t.label}</span>
                <div className={`flex items-center gap-1.5 bg-background-tertiary border rounded-lg overflow-hidden transition-colors w-24 ${error ? 'border-negative' : 'border-border focus-within:border-brand'}`}>
                  <input type="text" inputMode="decimal" aria-label={`Tipo del tramo ${t.label}`}
                    value={rateDrafts[i] ?? String(storedTipos[i])}
                    aria-invalid={!!error} aria-describedby={error ? `tramo-error-${i}` : undefined}
                    onChange={e => { const v = e.target.value; setRateDrafts(d => ({ ...d, [i]: v })); setRateErrors(er => { const n = { ...er }; delete n[i]; return n }) }}
                    onBlur={() => commitRate(i)} onKeyDown={blurOnEnter}
                    className="px-2 py-2 text-sm mono bg-transparent text-fg w-14 focus:outline-hidden" />
                  <span className="pr-2 text-sm text-fg-subtle">%</span>
                </div>
                {error
                  ? <span id={`tramo-error-${i}`} role="alert" className="text-xs text-negative-ink">{error}</span>
                  : storedTipos[i] !== DEFAULT_TIPOS[i] && <span className="text-xs text-warning-ink mono">por defecto: {DEFAULT_TIPOS[i]} %</span>}
              </div>
            )
          })}
        </div>
        <p className="text-xs text-fg-subtle flex items-start gap-1.5">
          <AlertCircle size={11} aria-hidden="true" className="shrink-0 mt-0.5" />
          Modifica solo si la normativa fiscal cambia. Afecta al simulador de venta y a la página Fiscal.
        </p>
        {fiscalBase && cuota && (
          <p aria-live="polite" className="text-xs rounded-lg bg-overlay/4 px-3 py-2 text-fg-muted">
            Cuota estimada de {fiscalBase.year}{fiscalBase.enCurso ? ' hasta hoy' : ''}: <span className="mono text-fg">{formatEur(cuota.antes)}</span>
            {cambiaTipos && cuota.diferencia !== 0 && (
              <>; con este cambio, <span className="mono text-fg">{formatEur(cuota.despues)}</span> ({cuota.diferencia > 0 ? '+' : ''}{formatEur(cuota.diferencia)})</>
            )}.
          </p>
        )}
      </SettingsCard>

      {/* Recordatorios de plazos (#451): la categoría Fiscal de los avisos */}
      <SettingsCard index={3} icon={BellRing} title="Recordatorios de plazos" status={<SavedMark stamp={saved} id="recordatorios" />}
        description="Aviso en la campana a 30 días de la campaña de la Renta y del plazo del Modelo 721, y de nuevo a 7 días. Es la misma opción que la categoría Fiscal de General."
        action={
          <label className="inline-flex items-center cursor-pointer shrink-0">
            <input type="checkbox" role="switch" checked={recordatorios} aria-label="Recordatorios de plazos fiscales" className="peer sr-only"
              onChange={e => void setRecordatorios(e.target.checked)} />
            <span aria-hidden="true"
              className="relative w-9 h-5 rounded-full bg-overlay/15 ring-1 ring-inset ring-fg-subtle/60 peer-checked:ring-0 transition-colors peer-checked:bg-brand-solid peer-focus-visible:ring-2 peer-focus-visible:ring-brand/60 after:absolute after:top-0.5 after:left-0.5 after:w-4 after:h-4 after:rounded-full after:bg-white after:transition-transform peer-checked:after:translate-x-4" />
          </label>
        } />
    </div>
  )
}
