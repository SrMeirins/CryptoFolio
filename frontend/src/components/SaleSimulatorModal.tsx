import { useState, useCallback, useId } from 'react'
import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { X, Calculator, AlertCircle } from 'lucide-react'
import { formatAmount, formatPrice } from '../utils/format'
import { useTramos } from '../hooks/useTramos'
import { calcularTramos, type TramoDesglose } from '../utils/tramosIrpf'
import { portfolioApi } from '../api/portfolio'
import { useDebounce } from '../hooks/useDebounce'
import { StepButton } from './StepButton'
import { calcStep } from '../utils/calcStep'
import { SaleSimulatorResults } from './SaleSimulatorResults'
import { EurOnlyBadge } from './EurOnlyBadge'
import { iconButtonClasses, Modal } from './ui'

interface Props {
  asset:        string
  totalQty:     number
  currentPrice: number
  onClose:      () => void
}

const inputCls = `
  flex-1 min-w-0 bg-transparent py-2.5 text-sm text-fg text-center
  placeholder-fg-subtle focus:outline-hidden mono
  [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none
`
const wrapCls = `
  flex items-center bg-overlay/5 border border-overlay/10 rounded-xl overflow-hidden
  focus-within:border-brand/60 transition-all
`

export function SaleSimulatorModal({ asset, totalQty, currentPrice, onClose }: Props) {
  const [qty,   setQty]   = useState(totalQty.toString())
  const [price, setPrice] = useState(currentPrice > 0 ? currentPrice.toFixed(4) : '')

  const titleId = useId()

  const debouncedQty   = useDebounce(qty,   400)
  const debouncedPrice = useDebounce(price, 400)

  // Simulación vía react-query: la clave incluye cantidad y precio, así que una
  // respuesta lenta de una consulta anterior nunca pisa a la más reciente.
  const qNum  = parseFloat(debouncedQty)
  const pNum  = parseFloat(debouncedPrice)
  const valid = qNum > 0 && !isNaN(pNum) && pNum >= 0
  const { data, isFetching: loading, error: queryError } = useQuery({
    queryKey: ['simulate-sale', asset, qNum, pNum],
    queryFn: () => portfolioApi.simulateSale(asset, qNum, pNum),
    enabled: valid,
    retry: false,
    // Mantiene el resultado anterior visible mientras se recalcula.
    placeholderData: keepPreviousData,
  })
  const result = valid && !queryError ? data ?? null : null
  const error  = valid && queryError ? queryError.message : null

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
  // (utils/tramosIrpf.ts) — antes este cálculo estaba reimplementado
  // aquí, con riesgo de divergir si cambia la normativa de tramos.
  const tramosDesglose: TramoDesglose[] = net > 0.005 ? calcularTramos(net, tramosConfig) : []

  return (
    <Modal onClose={onClose} labelledBy={titleId} size="md">

        {/* Header */}
        <div className="relative px-5 pt-5 pb-4 border-b border-border shrink-0 overflow-hidden">
          <div className="absolute inset-0 bg-linear-to-br from-brand/10 via-transparent to-transparent pointer-events-none" />
          <div className="relative flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 mb-0.5">
                <Calculator size={15} className="text-brand" />
                <span className="text-[11px] font-medium text-brand tracking-wide uppercase">Simulador de venta</span>
                <EurOnlyBadge />
              </div>
              <h2 id={titleId} className="text-xl font-bold tracking-tight">{asset}</h2>
              <p className="text-xs text-fg-subtle mt-0.5">
                Disponible: <span className="text-fg mono">{formatAmount(totalQty)} {asset}</span>
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar"
              className={iconButtonClasses('md', false, 'mt-0.5')}
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
              <label className="text-xs font-medium text-fg-muted mb-1.5 block">Cantidad a vender</label>
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
                className="mt-1.5 text-xs font-medium text-brand/80 hover:text-brand transition-colors"
              >
                Usar máximo ({formatAmount(totalQty)})
              </button>
            </div>

            {/* Precio */}
            <div>
              <label className="text-xs font-medium text-fg-muted mb-1.5 block">Precio venta (€/ud.)</label>
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
                  className="mt-1.5 text-xs font-medium text-brand/80 hover:text-brand transition-colors"
                >
                  Precio actual ({formatPrice(currentPrice)})
                </button>
              )}
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 px-3 py-2.5 bg-negative/10 border border-negative/25 rounded-xl text-xs text-negative">
              <AlertCircle size={13} className="shrink-0" /> {error}
            </div>
          )}

          {/* Spinner solo en la primera carga (sin resultado previo) */}
          {loading && !result && (
            <div className="flex items-center justify-center gap-2 py-6 text-xs text-fg-subtle">
              <span className="inline-block w-3 h-3 border border-border border-t-brand rounded-full animate-spin" />
              Calculando...
            </div>
          )}

          {/* Resultados: se mantienen visibles durante recalculo, fade suave */}
          {result && (
            <SaleSimulatorResults result={result} loading={loading} net={net} tramosDesglose={tramosDesglose} />
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-border shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="w-full py-2 text-sm text-fg-subtle hover:text-fg transition-colors rounded-xl hover:bg-overlay/5"
          >
            Cerrar
          </button>
        </div>
    </Modal>
  )
}
