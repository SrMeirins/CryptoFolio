import { useState, useEffect, useCallback, useId } from 'react'
import { X, Calculator, AlertCircle } from 'lucide-react'
import { formatAmount, formatPrice } from '../utils/format'
import { useTramos, calcularTramos, type TramoDesglose } from '../pages/fiscal/helpers'
import { portfolioApi, type SimulationResult } from '../api/portfolio'
import { useDebounce } from '../hooks/useDebounce'
import { useModalA11y } from '../hooks/useModalA11y'
import { calcStep, StepButton } from './StepButton'
import { SaleSimulatorResults } from './SaleSimulatorResults'

interface Props {
  asset:        string
  totalQty:     number
  currentPrice: number
  onClose:      () => void
}

const inputCls = `
  flex-1 min-w-0 bg-transparent py-2.5 text-sm text-white text-center
  placeholder-gray-600 focus:outline-none mono
  [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none
`
const wrapCls = `
  flex items-center bg-white/5 border border-white/10 rounded-xl overflow-hidden
  focus-within:border-accent-blue/60 transition-all
`

export function SaleSimulatorModal({ asset, totalQty, currentPrice, onClose }: Props) {
  const [qty,   setQty]   = useState(totalQty.toString())
  const [price, setPrice] = useState(currentPrice > 0 ? currentPrice.toFixed(4) : '')
  const [result,   setResult]   = useState<SimulationResult | null>(null)
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState<string | null>(null)

  const titleId = useId()
  const dialogRef = useModalA11y<HTMLDivElement>(onClose)

  const debouncedQty   = useDebounce(qty,   400)
  const debouncedPrice = useDebounce(price, 400)

  const simulate = useCallback(async (q: string, p: string) => {
    const qNum = parseFloat(q)
    const pNum = parseFloat(p)
    if (!qNum || qNum <= 0 || isNaN(pNum) || pNum < 0) {
      setResult(null)
      return
    }
    setLoading(true)
    setError(null)
    try {
      setResult(await portfolioApi.simulateSale(asset, qNum, pNum))
    } catch (e) {
      setError((e as Error).message)
      setResult(null)
    } finally {
      setLoading(false)
    }
  }, [asset])

  useEffect(() => { simulate(debouncedQty, debouncedPrice) }, [debouncedQty, debouncedPrice, simulate])

  // Handlers de paso para cantidad
  const decQty = useCallback(() => {
    setQty(v => {
      const n = parseFloat(v) || 0
      return String(Math.max(0, +(n - calcStep(n)).toPrecision(8)))
    })
  }, [])
  const incQty = useCallback(() => {
    setQty(v => {
      const n = parseFloat(v) || 0
      return String(Math.min(totalQty, +(n + calcStep(n)).toPrecision(8)))
    })
  }, [totalQty])

  // Handlers de paso para precio
  const decPrice = useCallback(() => {
    setPrice(v => {
      const n = parseFloat(v) || 0
      return String(Math.max(0, +(n - calcStep(n)).toPrecision(8)))
    })
  }, [])
  const incPrice = useCallback(() => {
    setPrice(v => {
      const n = parseFloat(v) || 0
      return String(+(n + calcStep(n)).toPrecision(8))
    })
  }, [])

  const tramosConfig = useTramos()

  const net = result?.netGainLoss ?? 0

  // Desglose por tramos reutilizando la misma función que TaxCards.tsx
  // (pages/fiscal/helpers.tsx) — antes este cálculo estaba reimplementado
  // aquí, con riesgo de divergir si cambia la normativa de tramos.
  const tramosDesglose: TramoDesglose[] = net > 0.005 ? calcularTramos(net, tramosConfig) : []

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-black/70 backdrop-blur-sm"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full sm:max-w-lg bg-[#0f1117] border border-white/10 rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[92vh]"
      >

        {/* Header */}
        <div className="relative px-5 pt-5 pb-4 border-b border-white/8 shrink-0 overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-accent-blue/10 via-transparent to-transparent pointer-events-none" />
          <div className="relative flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 mb-0.5">
                <Calculator size={15} className="text-accent-blue" />
                <span className="text-[11px] font-medium text-accent-blue tracking-wide uppercase">Simulador de venta</span>
              </div>
              <h2 id={titleId} className="text-xl font-bold tracking-tight">{asset}</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                Disponible: <span className="text-gray-300 mono">{formatAmount(totalQty)} {asset}</span>
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar"
              className="shrink-0 mt-0.5 p-1.5 text-gray-500 hover:text-white hover:bg-white/8 rounded-lg transition-all"
            >
              <X size={15} />
            </button>
          </div>
        </div>

        <div className="overflow-y-auto flex-1 p-5 space-y-5">

          {/* Inputs */}
          <div className="grid grid-cols-2 gap-3">
            {/* Cantidad */}
            <div>
              <label className="text-[11px] font-medium text-gray-400 mb-1.5 block">Cantidad a vender</label>
              <div className={wrapCls}>
                <StepButton label="−" onStep={decQty} />
                <input
                  type="number" step="any" min="0" max={totalQty}
                  value={qty} onChange={e => setQty(e.target.value)}
                  className={inputCls}
                />
                <StepButton label="+" onStep={incQty} />
              </div>
              <button
                type="button"
                onClick={() => setQty(totalQty.toString())}
                className="mt-1.5 text-[10px] font-medium text-accent-blue/80 hover:text-accent-blue transition-colors"
              >
                Usar máximo ({formatAmount(totalQty)})
              </button>
            </div>

            {/* Precio */}
            <div>
              <label className="text-[11px] font-medium text-gray-400 mb-1.5 block">Precio venta (€/ud.)</label>
              <div className={wrapCls}>
                <StepButton label="−" onStep={decPrice} />
                <input
                  type="number" step="any" min="0"
                  value={price} onChange={e => setPrice(e.target.value)}
                  className={inputCls}
                  placeholder="0.0000"
                />
                <StepButton label="+" onStep={incPrice} />
              </div>
              {currentPrice > 0 && (
                <button
                  type="button"
                  onClick={() => setPrice(currentPrice.toFixed(4))}
                  className="mt-1.5 text-[10px] font-medium text-accent-blue/80 hover:text-accent-blue transition-colors"
                >
                  Precio actual ({formatPrice(currentPrice)})
                </button>
              )}
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 px-3 py-2.5 bg-accent-red/10 border border-accent-red/25 rounded-xl text-xs text-accent-red">
              <AlertCircle size={13} className="shrink-0" /> {error}
            </div>
          )}

          {/* Spinner solo en la primera carga (sin resultado previo) */}
          {loading && !result && (
            <div className="flex items-center justify-center gap-2 py-6 text-xs text-gray-500">
              <span className="inline-block w-3 h-3 border border-gray-600 border-t-accent-blue rounded-full animate-spin" />
              Calculando...
            </div>
          )}

          {/* Resultados: se mantienen visibles durante recalculo, fade suave */}
          {result && (
            <SaleSimulatorResults result={result} loading={loading} net={net} tramosDesglose={tramosDesglose} />
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-white/8 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="w-full py-2 text-sm text-gray-500 hover:text-gray-200 transition-colors rounded-xl hover:bg-white/5"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  )
}
