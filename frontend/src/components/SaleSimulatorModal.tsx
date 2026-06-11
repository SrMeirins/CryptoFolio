import { useState, useEffect, useCallback, useRef } from 'react'
import { X, TrendingDown, TrendingUp, Calculator, ChevronDown, AlertCircle } from 'lucide-react'
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

// Paso basado en orden de magnitud del valor actual
function calcStep(value: number): number {
  if (value <= 0) return 0.01
  const mag = Math.pow(10, Math.floor(Math.log10(value)) - 1)
  return Math.max(mag, 1e-8)
}

// Hook: dispara callback al pulsar, y repite con aceleración si se mantiene
function useHoldRepeat(callback: () => void) {
  const cbRef    = useRef(callback)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const intRef   = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => { cbRef.current = callback }, [callback])

  const start = useCallback(() => {
    cbRef.current()
    timerRef.current = setTimeout(() => {
      intRef.current = setInterval(() => cbRef.current(), 80)
    }, 400)
  }, [])

  const stop = useCallback(() => {
    if (timerRef.current) { clearTimeout(timerRef.current);  timerRef.current = null }
    if (intRef.current)   { clearInterval(intRef.current);   intRef.current   = null }
  }, [])

  return { onMouseDown: start, onMouseUp: stop, onMouseLeave: stop, onTouchStart: start, onTouchEnd: stop }
}

const TRAMOS = [
  { desde: 0,      hasta: 6000,      tipo: 19 },
  { desde: 6000,   hasta: 50000,     tipo: 21 },
  { desde: 50000,  hasta: 200000,    tipo: 23 },
  { desde: 200000, hasta: 300000,    tipo: 27 },
  { desde: 300000, hasta: Infinity,  tipo: 28 },
]

interface TramoDesglose { tipo: number; base: number; cuota: number; label: string }

function calcularTramos(ganancia: number): TramoDesglose[] {
  if (ganancia <= 0) return []
  const result: TramoDesglose[] = []
  let restante = ganancia
  for (const t of TRAMOS) {
    if (restante <= 0) break
    const ancho = t.hasta === Infinity ? restante : Math.min(restante, t.hasta - t.desde)
    const base  = Math.min(restante, ancho)
    if (base <= 0) continue
    const label = t.hasta === Infinity
      ? `> ${formatEur(t.desde)}`
      : `${formatEur(t.desde)} – ${formatEur(t.hasta)}`
    result.push({ tipo: t.tipo, base, cuota: base * t.tipo / 100, label })
    restante -= base
  }
  return result
}

// Botón − / + con hold-to-repeat
function StepButton({ label, onStep }: { label: string; onStep: () => void }) {
  const hold = useHoldRepeat(onStep)
  return (
    <button
      {...hold}
      className="px-3 py-2.5 text-gray-500 hover:text-white hover:bg-white/8 active:bg-white/12 active:scale-90 transition-all text-base leading-none select-none"
    >
      {label}
    </button>
  )
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

  const net      = result?.netGainLoss ?? 0
  const isGain   = net > 0.005
  const isLoss   = net < -0.005
  const tramos   = isGain ? calcularTramos(net) : []
  const efectivo = result && isGain && result.irpfEstimate > 0
    ? (result.irpfEstimate / net * 100).toFixed(1)
    : null

  const inputCls = `
    flex-1 min-w-0 bg-transparent py-2.5 text-sm text-white text-center
    placeholder-gray-600 focus:outline-none mono
    [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none
  `
  const wrapCls = `
    flex items-center bg-white/5 border border-white/10 rounded-xl overflow-hidden
    focus-within:border-accent-blue/60 transition-all
  `

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-black/70 backdrop-blur-sm"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full sm:max-w-lg bg-[#0f1117] border border-white/10 rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[92vh]">

        {/* Header */}
        <div className="relative px-5 pt-5 pb-4 border-b border-white/8 shrink-0 overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-accent-blue/10 via-transparent to-transparent pointer-events-none" />
          <div className="relative flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 mb-0.5">
                <Calculator size={15} className="text-accent-blue" />
                <span className="text-[11px] font-medium text-accent-blue tracking-wide uppercase">Simulador de venta</span>
              </div>
              <h2 className="text-xl font-bold tracking-tight">{asset}</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                Disponible: <span className="text-gray-300 mono">{formatAmount(totalQty)} {asset}</span>
              </p>
            </div>
            <button
              onClick={onClose}
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
            <div className={`space-y-5 transition-opacity duration-150 ${loading ? 'opacity-40' : 'opacity-100'}`}>

              {/* Métricas principales */}
              <div className={`rounded-2xl border p-4 ${isGain ? 'bg-accent-green/5 border-accent-green/15' : isLoss ? 'bg-accent-red/5 border-accent-red/15' : 'bg-white/3 border-white/8'}`}>
                <div className="flex items-center gap-1.5 mb-4">
                  {isGain
                    ? <TrendingUp  size={14} className="text-accent-green" />
                    : isLoss
                    ? <TrendingDown size={14} className="text-accent-red" />
                    : null}
                  <span className="text-[11px] font-medium text-gray-400 uppercase tracking-wide">Resultado fiscal</span>
                </div>
                <div className="grid grid-cols-3 gap-3 mb-4">
                  <div>
                    <p className="text-[10px] text-gray-500 mb-1">Ingresos brutos</p>
                    <p className="text-base font-semibold mono">{formatEur(result.totalProceeds)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-gray-500 mb-1">Coste adquisición</p>
                    <p className="text-base font-semibold mono">{formatEur(result.totalCostBasis)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-gray-500 mb-1">Ganancia / Pérdida</p>
                    <p className={`text-base font-bold mono ${pnlColor(net)}`}>
                      {net >= 0 ? '+' : ''}{formatEur(net)}
                    </p>
                  </div>
                </div>
                {result.totalProceeds > 0 && (
                  <div className="h-1.5 rounded-full overflow-hidden bg-white/8 flex">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${Math.min(100, (result.totalCostBasis / result.totalProceeds) * 100).toFixed(1)}%`,
                        backgroundColor: isLoss ? 'rgb(239 68 68 / 0.7)' : 'rgb(99 102 241 / 0.6)',
                      }}
                    />
                  </div>
                )}
              </div>

              {/* IRPF desglose */}
              {isGain && tramos.length > 0 && (
                <div className="rounded-2xl border border-accent-amber/20 bg-accent-amber/5 overflow-hidden">
                  <div className="px-4 pt-4 pb-3 border-b border-accent-amber/10">
                    <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wide mb-1">Retención IRPF estimada</p>
                    <div className="flex items-end gap-3">
                      <span className="text-2xl font-bold mono text-accent-amber">{formatEur(result.irpfEstimate)}</span>
                      {efectivo && (
                        <span className="text-xs text-gray-500 mb-0.5">
                          tipo efectivo <span className="text-accent-amber font-medium">{efectivo}%</span>
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="px-4 py-3 space-y-1.5">
                    <p className="text-[10px] font-medium text-gray-500 uppercase tracking-wide mb-2">Desglose por tramos (IRPF 2024)</p>
                    {tramos.map((t, i) => (
                      <div key={i} className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="shrink-0 text-[10px] font-bold text-accent-amber bg-accent-amber/15 px-1.5 py-0.5 rounded-md mono">{t.tipo}%</span>
                          <span className="text-[10px] text-gray-500 truncate">{t.label}</span>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <span className="text-[10px] text-gray-400 mono">{formatEur(t.base)}</span>
                          <span className="text-[10px] text-accent-amber font-medium mono w-16 text-right">{formatEur(t.cuota)}</span>
                        </div>
                      </div>
                    ))}
                    <div className="flex items-center justify-between pt-2 mt-2 border-t border-accent-amber/15">
                      <span className="text-[10px] font-medium text-gray-400">Neto tras impuestos</span>
                      <span className="text-[10px] font-semibold text-white mono">{formatEur(result.totalProceeds - result.irpfEstimate)}</span>
                    </div>
                  </div>
                  <div className="px-4 pb-3">
                    <p className="text-[9px] text-gray-600 leading-relaxed">Estimación orientativa sobre la ganancia neta, sin considerar otras rentas del ejercicio ni deducciones aplicables.</p>
                  </div>
                </div>
              )}

              {/* Nota pérdida */}
              {isLoss && (
                <div className="flex items-start gap-2.5 px-3.5 py-3 rounded-xl border border-white/8 bg-white/3">
                  <TrendingDown size={13} className="text-accent-red shrink-0 mt-0.5" />
                  <p className="text-[11px] text-gray-400 leading-relaxed">
                    Pérdida de <span className="text-accent-red font-medium mono">{formatEur(Math.abs(net))}</span>.
                    Puede compensar ganancias del mismo ejercicio o de los 4 siguientes.
                  </p>
                </div>
              )}

              {/* Desglose lotes */}
              <div>
                <button
                  onClick={() => setShowLots(s => !s)}
                  className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-200 transition-colors w-full"
                >
                  <span className={`transition-transform duration-200 ${showLots ? 'rotate-180' : ''}`}>
                    <ChevronDown size={13} />
                  </span>
                  <span>Desglose FIFO</span>
                  <span className="text-gray-600">·</span>
                  <span className="text-gray-600">{result.lotsConsumed.length} lote{result.lotsConsumed.length !== 1 ? 's' : ''}</span>
                </button>

                {showLots && (
                  <div className="mt-3 rounded-xl border border-white/8 overflow-hidden">
                    <table className="w-full text-[10px]">
                      <thead>
                        <tr className="border-b border-white/8 bg-white/3">
                          <th className="text-left px-3 py-2 font-medium text-gray-500">Fecha</th>
                          <th className="text-left px-3 py-2 font-medium text-gray-500">Wallet</th>
                          <th className="text-right px-3 py-2 font-medium text-gray-500">Cantidad</th>
                          <th className="text-right px-3 py-2 font-medium text-gray-500">Adq. €/ud</th>
                          <th className="text-right px-3 py-2 font-medium text-gray-500">G/P</th>
                        </tr>
                      </thead>
                      <tbody>
                        {result.lotsConsumed.map((lot, i) => (
                          <tr key={i} className={`border-b border-white/5 last:border-0 ${i % 2 === 1 ? 'bg-white/2' : ''}`}>
                            <td className="px-3 py-2 text-gray-400 mono">{lot.openedAt}</td>
                            <td className="px-3 py-2 text-gray-400">{lot.walletName}</td>
                            <td className="px-3 py-2 text-right mono text-gray-300">{formatAmount(lot.qtyConsumed)}</td>
                            <td className="px-3 py-2 text-right mono text-gray-400">{formatPrice(lot.pricePerUnit)}</td>
                            <td className={`px-3 py-2 text-right mono font-medium ${pnlColor(lot.gainLossEur)}`}>
                              {lot.gainLossEur >= 0 ? '+' : ''}{formatEur(lot.gainLossEur)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-white/8 shrink-0">
          <button
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
