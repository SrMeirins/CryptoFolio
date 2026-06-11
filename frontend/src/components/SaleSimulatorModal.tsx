import { useState, useEffect, useCallback } from 'react'
import { X, TrendingDown, TrendingUp, Calculator, ChevronDown, ChevronUp, AlertCircle } from 'lucide-react'
import { formatEur, formatAmount, formatPrice, pnlColor } from '../utils/format'

interface SimulatedLot {
  lotId:             string
  walletName:        string
  openedAt:          string
  qtyAvailable:      number
  qtyConsumed:       number
  costBasisConsumed: number
  pricePerUnit:      number
  proceedsEur:       number
  gainLossEur:       number
}

interface SimulationResult {
  asset:          string
  quantity:       number
  priceEur:       number
  totalProceeds:  number
  totalCostBasis: number
  totalGain:      number
  totalLoss:      number
  netGainLoss:    number
  irpfEstimate:   number
  lotsConsumed:   SimulatedLot[]
}

interface Props {
  asset:        string
  totalQty:     number
  currentPrice: number
  onClose:      () => void
}

function useDebounce<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return debounced
}

export function SaleSimulatorModal({ asset, totalQty, currentPrice, onClose }: Props) {
  const [qty,   setQty]   = useState(totalQty.toString())
  const [price, setPrice] = useState(currentPrice > 0 ? currentPrice.toFixed(4) : '')
  const [result,   setResult]   = useState<SimulationResult | null>(null)
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState<string | null>(null)
  const [showLots, setShowLots] = useState(false)

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
      const res = await fetch('/api/fiscal/simulate-sale', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ asset, quantity: qNum, priceEur: pNum }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error); setResult(null); return }
      setResult(data)
    } catch {
      setError('Error de conexión')
    } finally {
      setLoading(false)
    }
  }, [asset])

  useEffect(() => { simulate(debouncedQty, debouncedPrice) }, [debouncedQty, debouncedPrice, simulate])

  const net = result?.netGainLoss ?? 0
  const isGain = net > 0.005
  const isLoss = net < -0.005

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-lg bg-background-card border border-border rounded-2xl shadow-2xl flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <Calculator size={16} className="text-accent-blue" />
            <h2 className="font-semibold text-sm">Simulador de venta — {asset}</h2>
          </div>
          <button onClick={onClose} className="p-1.5 text-gray-500 hover:text-white hover:bg-background-tertiary rounded-lg transition-colors">
            <X size={15} />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-5 space-y-4">

          {/* Inputs */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Cantidad a vender</label>
              <div className="relative">
                <input
                  type="number"
                  step="any"
                  min="0"
                  max={totalQty}
                  value={qty}
                  onChange={e => setQty(e.target.value)}
                  className="w-full bg-background-primary border border-border rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-accent-blue transition-colors mono"
                />
                <button
                  onClick={() => setQty(totalQty.toString())}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-accent-blue hover:text-accent-blue/80 font-medium"
                >
                  MAX
                </button>
              </div>
              <p className="text-[10px] text-gray-600 mt-1">Disponible: {formatAmount(totalQty)}</p>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Precio de venta (€/ud.)</label>
              <input
                type="number"
                step="any"
                min="0"
                value={price}
                onChange={e => setPrice(e.target.value)}
                className="w-full bg-background-primary border border-border rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-accent-blue transition-colors mono"
                placeholder="Precio EUR por unidad"
              />
              {currentPrice > 0 && (
                <button onClick={() => setPrice(currentPrice.toFixed(4))} className="text-[10px] text-accent-blue hover:text-accent-blue/80 mt-1">
                  Usar precio actual ({formatPrice(currentPrice)})
                </button>
              )}
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 px-3 py-2 bg-accent-red/10 border border-accent-red/30 rounded-lg text-xs text-accent-red">
              <AlertCircle size={13} /> {error}
            </div>
          )}

          {/* Resultado */}
          {loading && (
            <div className="text-center text-xs text-gray-500 py-4">Calculando...</div>
          )}

          {result && !loading && (
            <>
              {/* Métricas principales */}
              <div className={`rounded-xl border p-4 ${isGain ? 'bg-accent-green/5 border-accent-green/20' : isLoss ? 'bg-accent-red/5 border-accent-red/20' : 'bg-background-tertiary border-border'}`}>
                <div className="flex items-center gap-2 mb-3">
                  {isGain ? <TrendingUp size={15} className="text-accent-green" /> : isLoss ? <TrendingDown size={15} className="text-accent-red" /> : null}
                  <span className="text-xs font-medium text-gray-300">Resultado fiscal estimado</span>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <p className="text-[10px] text-gray-500 mb-0.5">Ingresos brutos</p>
                    <p className="font-semibold text-sm mono">{formatEur(result.totalProceeds)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-gray-500 mb-0.5">Coste adquisición</p>
                    <p className="font-semibold text-sm mono">{formatEur(result.totalCostBasis)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-gray-500 mb-0.5">G/P neta</p>
                    <p className={`font-bold text-sm mono ${pnlColor(net)}`}>
                      {net >= 0 ? '+' : ''}{formatEur(net)}
                    </p>
                  </div>
                </div>
              </div>

              {/* IRPF */}
              {result.irpfEstimate > 0 && (
                <div className="rounded-xl border border-accent-amber/20 bg-accent-amber/5 p-4">
                  <p className="text-[10px] text-gray-500 mb-1">Retención IRPF estimada</p>
                  <p className="text-xl font-bold mono text-accent-amber">{formatEur(result.irpfEstimate)}</p>
                  <p className="text-[10px] text-gray-500 mt-1">
                    Beneficio neto tras impuestos: <span className="text-white font-medium">{formatEur(result.totalProceeds - result.irpfEstimate)}</span>
                  </p>
                  <p className="text-[10px] text-gray-600 mt-2">Estimación orientativa sobre la ganancia neta, sin considerar otras rentas del año.</p>
                </div>
              )}

              {result.netGainLoss < 0 && (
                <div className="rounded-xl border border-border bg-background-tertiary/50 p-3">
                  <p className="text-[10px] text-gray-500">Esta pérdida puede compensar ganancias del mismo ejercicio o de los 4 siguientes.</p>
                </div>
              )}

              {/* Desglose de lotes */}
              <div>
                <button
                  onClick={() => setShowLots(s => !s)}
                  className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white transition-colors w-full"
                >
                  {showLots ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                  Desglose FIFO — {result.lotsConsumed.length} lote{result.lotsConsumed.length !== 1 ? 's' : ''} consumido{result.lotsConsumed.length !== 1 ? 's' : ''}
                </button>

                {showLots && (
                  <div className="mt-2 space-y-1.5">
                    {result.lotsConsumed.map((lot, i) => (
                      <div key={i} className="rounded-lg border border-border bg-background-primary px-3 py-2">
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-gray-400">{lot.openedAt}</span>
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-background-tertiary text-gray-500">{lot.walletName}</span>
                          </div>
                          <span className={`text-xs font-medium mono ${pnlColor(lot.gainLossEur)}`}>
                            {lot.gainLossEur >= 0 ? '+' : ''}{formatEur(lot.gainLossEur)}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 text-[10px] text-gray-500 mono">
                          <span>{formatAmount(lot.qtyConsumed)} {asset}</span>
                          <span>·</span>
                          <span>Adq. {formatPrice(lot.pricePerUnit)}</span>
                          <span>·</span>
                          <span>Coste {formatEur(lot.costBasisConsumed)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-border shrink-0">
          <button onClick={onClose} className="w-full py-2 text-sm text-gray-400 hover:text-white transition-colors">
            Cerrar
          </button>
        </div>
      </div>
    </div>
  )
}
