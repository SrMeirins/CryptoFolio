import { useState, useMemo, type KeyboardEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { portfolioApi } from '../../api/portfolio'
import { AlertCircle, Check, RotateCcw, Calculator, Landmark, Percent, Globe } from 'lucide-react'
import { TRAMOS_DEFAULT } from '../../utils/tramosIrpf'
import { SettingsCard } from './SettingsCard'
import { SavedMark } from './SavedMark'
import { useSettingFeedback } from '../../hooks/useSettingFeedback'
import { useToast } from '../../hooks/useToast'
import { validateRate, validateThreshold } from '../../utils/settingsValidation'
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

  return (
    <div className="space-y-4 max-w-3xl">
      {/* Método de cálculo: FIFO único */}
      <SettingsCard index={0} icon={Calculator} title="Método de cálculo de plusvalías"
        description="La normativa española (AEAT) obliga al uso de FIFO para criptoactivos.">
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-brand/40 bg-brand/6 w-fit">
          <Check size={15} aria-hidden="true" className="text-brand-ink shrink-0" />
          <div>
            <p className="text-sm font-semibold text-brand-ink">FIFO</p>
            <p className="text-xs text-fg-subtle">First In, First Out</p>
          </div>
        </div>
        <p className="text-xs text-fg-subtle flex items-start gap-1.5">
          <AlertCircle size={11} aria-hidden="true" className="shrink-0 mt-0.5" />
          FIFO es el único método soportado y el exigido por la AEAT.
        </p>
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
      </SettingsCard>

      {/* País fiscal */}
      <SettingsCard index={3} icon={Globe} title="País de residencia fiscal"
        description="Determina la normativa aplicable y los formularios generados.">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-brand/40 bg-brand/6">
            <div>
              <p className="text-sm font-medium">España</p>
              <p className="text-xs text-fg-subtle">IRPF · Modelo 100 · Modelo 721</p>
            </div>
            <Check size={14} aria-hidden="true" className="text-brand-ink ml-2" />
          </div>
          <span className="text-xs text-fg-subtle">Otros países: próximamente</span>
        </div>
      </SettingsCard>
    </div>
  )
}
