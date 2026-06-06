import { useState, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { portfolioApi } from '../../api/portfolio'
import { AlertCircle, Check } from 'lucide-react'

export function FiscalSection() {
  const { data: config = {} } = useQuery({ queryKey: ['config'], queryFn: portfolioApi.getConfig })
  const queryClient = useQueryClient()

  const threshold = parseInt(config['modelo721_threshold'] ?? '50000')
  const [thresholdInput, setThresholdInput] = useState('')
  const [savingThreshold, setSavingThreshold] = useState(false)

  useEffect(() => {
    setThresholdInput(String(threshold))
  }, [threshold])

  async function saveThreshold() {
    setSavingThreshold(true)
    await portfolioApi.setConfig('modelo721_threshold', thresholdInput)
    queryClient.invalidateQueries({ queryKey: ['config'] })
    setSavingThreshold(false)
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
