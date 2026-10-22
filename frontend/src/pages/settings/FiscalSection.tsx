import { useState, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { portfolioApi } from '../../api/portfolio'
import { AlertCircle, Check, RotateCcw } from 'lucide-react'
import { TRAMOS_DEFAULT } from '../../utils/tramosIrpf'
import { SettingsCard } from './SettingsCard'
import { buttonClasses } from '../../components/ui'
import { formatNumber } from '../../utils/format'

export function FiscalSection() {
  const { data: config = {} } = useQuery({ queryKey: ['config'], queryFn: portfolioApi.getConfig })
  const queryClient = useQueryClient()

  const threshold = parseInt(config['modelo721_threshold'] ?? '50000')
  // Borrador local: null mientras el usuario no edita → se muestra el valor
  // guardado (sin copiarlo a estado con un efecto). Al guardar se descarta.
  const [thresholdDraft, setThresholdInput] = useState<string | null>(null)
  const thresholdInput = thresholdDraft ?? String(threshold)
  const [savingThreshold, setSavingThreshold] = useState(false)

  async function saveThreshold() {
    setSavingThreshold(true)
    try {
      await portfolioApi.setConfig('modelo721_threshold', thresholdInput)
      await queryClient.invalidateQueries({ queryKey: ['config'] })
      setThresholdInput(null)
    } finally {
      setSavingThreshold(false)
    }
  }

  // ── Tramos IRPF ──────────────────────────────────────────────────────────
  // Tipos guardados en config (o los por defecto si no hay o son inválidos).
  const storedTipos: number[] = useMemo(() => {
    const raw = config['irpf_tramos_tipos']
    if (!raw) return TRAMOS_DEFAULT.map(t => t.tipo)
    try {
      const arr = JSON.parse(raw)
      if (Array.isArray(arr) && arr.length === TRAMOS_DEFAULT.length) return arr
    } catch { /* noop */ }
    return TRAMOS_DEFAULT.map(t => t.tipo)
  }, [config])

  // Mismo patrón de borrador que el umbral.
  const [tramosDraft, setTramosInput] = useState<string[] | null>(null)
  const tramosInput = tramosDraft ?? storedTipos.map(String)
  const [savingTramos, setSavingTramos] = useState(false)
  const [savedTramos, setSavedTramos] = useState(false)

  const tramosModified = tramosInput.some((v, i) => parseFloat(v) !== storedTipos[i])
  const tramosValid    = tramosInput.every(v => { const n = parseFloat(v); return !isNaN(n) && n > 0 && n <= 100 })

  async function saveTramos() {
    if (!tramosValid) return
    setSavingTramos(true)
    try {
      const tipos = tramosInput.map(v => parseFloat(v))
      await portfolioApi.setConfig('irpf_tramos_tipos', JSON.stringify(tipos))
      await queryClient.invalidateQueries({ queryKey: ['config'] })
      setTramosInput(null)
      setSavedTramos(true)
      setTimeout(() => setSavedTramos(false), 2000)
    } finally {
      setSavingTramos(false)
    }
  }

  function resetTramos() {
    setTramosInput(TRAMOS_DEFAULT.map(t => String(t.tipo)))
  }

  return (
    <div className="space-y-6 max-w-2xl">

      {/* Método de cálculo — FIFO único */}
      <SettingsCard
        title="Método de cálculo de plusvalías"
        description="La normativa española (AEAT) obliga al uso de FIFO para criptoactivos."
      >
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-brand/40 bg-brand/6 w-fit">
          <Check size={15} className="text-brand shrink-0" />
          <div>
            <p className="text-sm font-semibold text-brand">FIFO</p>
            <p className="text-xs text-fg-subtle">First In, First Out</p>
          </div>
        </div>
        <p className="text-xs text-fg-subtle flex items-start gap-1.5">
          <AlertCircle size={11} className="shrink-0 mt-0.5" />
          FIFO es el único método soportado y el exigido por la AEAT.
        </p>
      </SettingsCard>

      {/* Umbral Modelo 721 */}
      <SettingsCard
        title="Umbral Modelo 721"
        description="Importe a partir del cual existe obligación de presentar el Modelo 721 (criptoactivos en exchanges extranjeros)."
      >
        <div className="flex items-center gap-2">
          {[25000, 50000, 100000].map(preset => (
            <button key={preset} type="button" onClick={() => setThresholdInput(String(preset))}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                thresholdInput === String(preset)
                  ? 'border-brand bg-brand/10 text-brand-ink'
                  : 'border-border bg-background-tertiary text-fg-muted hover:border-fg-subtle hover:text-fg'
              }`}>
              €{formatNumber(preset, 0)}
            </button>
          ))}
          <span className="text-xs text-fg-subtle ml-1">o introduce un valor personalizado:</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-0 bg-background-tertiary border border-border rounded-lg overflow-hidden focus-within:border-brand transition-colors">
            <span className="px-3 py-2.5 text-sm text-fg-subtle border-r border-border bg-background-secondary">€</span>
            <input type="text" inputMode="numeric" value={thresholdInput}
              onChange={e => setThresholdInput(e.target.value.replace(/[^0-9]/g, ''))}
              className="px-3 py-2.5 text-sm mono bg-transparent text-fg w-32 focus:outline-hidden"
              placeholder="50000" />
          </div>
          <button type="button" onClick={saveThreshold}
            disabled={savingThreshold || thresholdInput === String(threshold) || !thresholdInput}
            className={buttonClasses('primary', 'lg')}>
            {savingThreshold ? 'Guardando...' : 'Guardar'}
          </button>
          {thresholdInput === String(threshold) && threshold > 0 && (
            <div className="flex items-center gap-1.5 text-xs text-positive">
              <Check size={12} /> Guardado: €{formatNumber(threshold, 0)}
            </div>
          )}
        </div>
        <p className="text-xs text-fg-subtle flex items-start gap-1.5">
          <AlertCircle size={11} className="shrink-0 mt-0.5" />
          El umbral legal vigente es €50.000. Modifícalo solo si la normativa cambia.
        </p>
      </SettingsCard>

      {/* Tramos IRPF */}
      <SettingsCard
        title="Tramos IRPF — base del ahorro"
        description="Porcentajes aplicables a las ganancias patrimoniales. Los tramos en euros son fijos por ley."
        action={
          <button type="button" onClick={resetTramos}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-fg-subtle hover:text-fg border border-border hover:border-fg-subtle transition-all shrink-0">
            <RotateCcw size={11} /> Restaurar
          </button>
        }
      >
        <div className="space-y-2">
          {TRAMOS_DEFAULT.map((t, i) => (
            <div key={i} className="flex items-center gap-3">
              <span className="text-xs text-fg-subtle w-44 shrink-0">{t.label}</span>
              <div className="flex items-center gap-1.5 bg-background-tertiary border border-border rounded-lg overflow-hidden focus-within:border-brand transition-colors w-24">
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  value={tramosInput[i] ?? t.tipo}
                  onChange={e => {
                    const next = [...tramosInput]
                    next[i] = e.target.value
                    setTramosInput(next)
                  }}
                  className="px-2 py-2 text-sm mono bg-transparent text-fg w-14 focus:outline-hidden [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
                <span className="pr-2 text-sm text-fg-subtle">%</span>
              </div>
              {parseFloat(tramosInput[i]) !== TRAMOS_DEFAULT[i].tipo && (
                <span className="text-xs text-warning mono">
                  por defecto: {TRAMOS_DEFAULT[i].tipo}%
                </span>
              )}
            </div>
          ))}
        </div>

        <div className="flex items-center gap-3 pt-1">
          <button type="button" onClick={saveTramos}
            disabled={savingTramos || !tramosModified || !tramosValid}
            className={buttonClasses('primary', 'lg')}>
            {savingTramos ? 'Guardando...' : 'Guardar tramos'}
          </button>
          {savedTramos && (
            <div className="flex items-center gap-1.5 text-xs text-positive">
              <Check size={12} /> Guardado
            </div>
          )}
          {!tramosValid && tramosModified && (
            <p className="text-xs text-negative flex items-center gap-1">
              <AlertCircle size={11} /> Valores entre 0 y 100
            </p>
          )}
        </div>

        <p className="text-xs text-fg-subtle flex items-start gap-1.5">
          <AlertCircle size={11} className="shrink-0 mt-0.5" />
          Modifica solo si la normativa fiscal cambia. Afecta al simulador de venta y a la página Fiscal.
        </p>
      </SettingsCard>

      {/* País fiscal */}
      <SettingsCard
        title="País de residencia fiscal"
        description="Determina la normativa aplicable y los formularios generados."
      >
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-brand/40 bg-brand/6">
            <span className="text-lg">🇪🇸</span>
            <div>
              <p className="text-sm font-medium">España</p>
              <p className="text-xs text-fg-subtle">IRPF · Modelo 100 · Modelo 721</p>
            </div>
            <Check size={14} className="text-brand ml-2" />
          </div>
          <span className="text-xs text-fg-subtle">Otros países: Próximamente</span>
        </div>
      </SettingsCard>

    </div>
  )
}
