import { useState, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { portfolioApi } from '../../api/portfolio'
import { AlertCircle, Check, RotateCcw } from 'lucide-react'
import { TRAMOS_DEFAULT } from '../fiscal/helpers'

export function FiscalSection() {
  const { data: config = {} } = useQuery({ queryKey: ['config'], queryFn: portfolioApi.getConfig })
  const queryClient = useQueryClient()

  const threshold = parseInt(config['modelo721_threshold'] ?? '50000')
  const [thresholdInput, setThresholdInput] = useState('')
  const [savingThreshold, setSavingThreshold] = useState(false)

  useEffect(() => { setThresholdInput(String(threshold)) }, [threshold])

  async function saveThreshold() {
    setSavingThreshold(true)
    await portfolioApi.setConfig('modelo721_threshold', thresholdInput)
    queryClient.invalidateQueries({ queryKey: ['config'] })
    setSavingThreshold(false)
  }

  // ── Tramos IRPF ──────────────────────────────────────────────────────────
  const storedTipos: number[] = (() => {
    const raw = config['irpf_tramos_tipos']
    if (!raw) return TRAMOS_DEFAULT.map(t => t.tipo)
    try {
      const arr = JSON.parse(raw)
      if (Array.isArray(arr) && arr.length === TRAMOS_DEFAULT.length) return arr
    } catch { /* noop */ }
    return TRAMOS_DEFAULT.map(t => t.tipo)
  })()

  const [tramosInput, setTramosInput] = useState<string[]>([])
  const [savingTramos, setSavingTramos] = useState(false)
  const [savedTramos, setSavedTramos] = useState(false)

  useEffect(() => { setTramosInput(storedTipos.map(String)) }, [config])

  const tramosModified = tramosInput.some((v, i) => parseFloat(v) !== storedTipos[i])
  const tramosValid    = tramosInput.every(v => { const n = parseFloat(v); return !isNaN(n) && n > 0 && n <= 100 })

  async function saveTramos() {
    if (!tramosValid) return
    setSavingTramos(true)
    const tipos = tramosInput.map(v => parseFloat(v))
    await portfolioApi.setConfig('irpf_tramos_tipos', JSON.stringify(tipos))
    queryClient.invalidateQueries({ queryKey: ['config'] })
    setSavingTramos(false)
    setSavedTramos(true)
    setTimeout(() => setSavedTramos(false), 2000)
  }

  function resetTramos() {
    setTramosInput(TRAMOS_DEFAULT.map(t => String(t.tipo)))
  }

  return (
    <div className="space-y-6 max-w-2xl">

      {/* Método de cálculo — FIFO único */}
      <div className="rounded-xl border border-border bg-background-card p-5 space-y-3">
        <div>
          <h3 className="font-semibold text-sm">Método de cálculo de plusvalías</h3>
          <p className="text-xs text-gray-500 mt-1">
            La normativa española (AEAT) obliga al uso de FIFO para criptoactivos.
          </p>
        </div>
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-accent-blue/40 bg-accent-blue/6 w-fit">
          <Check size={15} className="text-accent-blue shrink-0" />
          <div>
            <p className="text-sm font-semibold text-accent-blue">FIFO</p>
            <p className="text-xs text-gray-500">First In, First Out</p>
          </div>
        </div>
        <p className="text-xs text-gray-600 flex items-start gap-1.5">
          <AlertCircle size={11} className="shrink-0 mt-0.5" />
          FIFO es el único método soportado y el exigido por la AEAT.
        </p>
      </div>

      {/* Umbral Modelo 721 */}
      <div className="rounded-xl border border-border bg-background-card p-5 space-y-4">
        <div>
          <h3 className="font-semibold text-sm">Umbral Modelo 721</h3>
          <p className="text-xs text-gray-500 mt-1">
            Importe a partir del cual existe obligación de presentar el Modelo 721
            (criptoactivos en exchanges extranjeros).
          </p>
        </div>
        <div className="flex items-center gap-2">
          {[25000, 50000, 100000].map(preset => (
            <button key={preset} onClick={() => setThresholdInput(String(preset))}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                thresholdInput === String(preset)
                  ? 'border-accent-blue bg-accent-blue/10 text-accent-blue'
                  : 'border-border bg-background-tertiary text-gray-400 hover:border-gray-500 hover:text-gray-300'
              }`}>
              €{preset.toLocaleString('es-ES')}
            </button>
          ))}
          <span className="text-xs text-gray-600 ml-1">o introduce un valor personalizado:</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-0 bg-background-tertiary border border-border rounded-lg overflow-hidden focus-within:border-accent-blue transition-colors">
            <span className="px-3 py-2.5 text-sm text-gray-500 border-r border-border bg-background-secondary">€</span>
            <input type="text" inputMode="numeric" value={thresholdInput}
              onChange={e => setThresholdInput(e.target.value.replace(/[^0-9]/g, ''))}
              className="px-3 py-2.5 text-sm mono bg-transparent text-white w-32 focus:outline-none"
              placeholder="50000" />
          </div>
          <button onClick={saveThreshold}
            disabled={savingThreshold || thresholdInput === String(threshold) || !thresholdInput}
            className="px-4 py-2.5 bg-accent-blue hover:bg-accent-blue/80 disabled:opacity-40 rounded-lg text-sm font-medium transition-colors">
            {savingThreshold ? 'Guardando...' : 'Guardar'}
          </button>
          {thresholdInput === String(threshold) && threshold > 0 && (
            <div className="flex items-center gap-1.5 text-xs text-accent-green">
              <Check size={12} /> Guardado: €{threshold.toLocaleString('es-ES')}
            </div>
          )}
        </div>
        <p className="text-xs text-gray-600 flex items-start gap-1.5">
          <AlertCircle size={11} className="shrink-0 mt-0.5" />
          El umbral legal vigente es €50.000. Modifícalo solo si la normativa cambia.
        </p>
      </div>

      {/* Tramos IRPF */}
      <div className="rounded-xl border border-border bg-background-card p-5 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="font-semibold text-sm">Tramos IRPF — base del ahorro</h3>
            <p className="text-xs text-gray-500 mt-1">
              Porcentajes aplicables a las ganancias patrimoniales. Los tramos en euros son fijos por ley.
            </p>
          </div>
          <button
            onClick={resetTramos}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-gray-500 hover:text-white border border-border hover:border-gray-500 transition-all shrink-0"
          >
            <RotateCcw size={11} /> Restaurar
          </button>
        </div>

        <div className="space-y-2">
          {TRAMOS_DEFAULT.map((t, i) => (
            <div key={i} className="flex items-center gap-3">
              <span className="text-xs text-gray-500 w-44 shrink-0">{t.label}</span>
              <div className="flex items-center gap-1.5 bg-background-tertiary border border-border rounded-lg overflow-hidden focus-within:border-accent-blue transition-colors w-24">
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
                  className="px-2 py-2 text-sm mono bg-transparent text-white w-14 focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
                <span className="pr-2 text-sm text-gray-500">%</span>
              </div>
              {parseFloat(tramosInput[i]) !== TRAMOS_DEFAULT[i].tipo && (
                <span className="text-[10px] text-accent-amber mono">
                  por defecto: {TRAMOS_DEFAULT[i].tipo}%
                </span>
              )}
            </div>
          ))}
        </div>

        <div className="flex items-center gap-3 pt-1">
          <button
            onClick={saveTramos}
            disabled={savingTramos || !tramosModified || !tramosValid}
            className="px-4 py-2.5 bg-accent-blue hover:bg-accent-blue/80 disabled:opacity-40 rounded-lg text-sm font-medium transition-colors"
          >
            {savingTramos ? 'Guardando...' : 'Guardar tramos'}
          </button>
          {savedTramos && (
            <div className="flex items-center gap-1.5 text-xs text-accent-green">
              <Check size={12} /> Guardado
            </div>
          )}
          {!tramosValid && tramosModified && (
            <p className="text-xs text-accent-red flex items-center gap-1">
              <AlertCircle size={11} /> Valores entre 0 y 100
            </p>
          )}
        </div>

        <p className="text-xs text-gray-600 flex items-start gap-1.5">
          <AlertCircle size={11} className="shrink-0 mt-0.5" />
          Modifica solo si la normativa fiscal cambia. Afecta al simulador de venta y a la página Fiscal.
        </p>
      </div>

      {/* País fiscal */}
      <div className="rounded-xl border border-border bg-background-card p-5 space-y-3">
        <div>
          <h3 className="font-semibold text-sm">País de residencia fiscal</h3>
          <p className="text-xs text-gray-500 mt-1">Determina la normativa aplicable y los formularios generados.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-accent-blue/40 bg-accent-blue/6">
            <span className="text-lg">🇪🇸</span>
            <div>
              <p className="text-sm font-medium">España</p>
              <p className="text-xs text-gray-500">IRPF · Modelo 100 · Modelo 721</p>
            </div>
            <Check size={14} className="text-accent-blue ml-2" />
          </div>
          <span className="text-xs text-gray-600">Otros países: Próximamente</span>
        </div>
      </div>

    </div>
  )
}
