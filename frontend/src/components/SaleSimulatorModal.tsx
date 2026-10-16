import { useId, useMemo, useState } from 'react'
import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { X, Calculator, AlertCircle } from 'lucide-react'
import { formatAmount, formatEur, formatPercent, formatPrice } from '../utils/format'
import { portfolioApi } from '../api/portfolio'
import { usePricesStore } from '../store/pricesStore'
import { useDebounce } from '../hooks/useDebounce'
import { StepButton } from './StepButton'
import { calcStep } from '../utils/calcStep'
import { SaleSimulatorResults } from './SaleSimulatorResults'
import { SaleSimulatorChart } from './SaleSimulatorChart'
import { AnimatedNumber } from './AnimatedNumber'
import { EurOnlyBadge } from './EurOnlyBadge'
import { iconButtonClasses, Modal, Dropdown, SegmentedControl } from './ui'
import { parseFeePct, readFeePct, saveFeePct, walletQuantities } from '../utils/saleSimulator'
import { QTY_PCTS, curvePrices, pctOfWallet, priceScenarios, qtyForPct, saleBreakEven, walletBreakEven } from '../utils/saleSimulatorView'

interface Props {
  asset:        string
  totalQty:     number
  currentPrice: number
  onClose:      () => void
}

type Mode = 'qty' | 'net'

const MODE_OPTIONS = [
  { value: 'qty' as const, label: 'Cantidad' },
  // Sin `title`: el control lo usa como nombre accesible y debe coincidir con el texto visible.
  { value: 'net' as const, label: 'Importe a recibir' },
]

const inputCls = `
  flex-1 min-w-0 bg-transparent py-2.5 text-sm text-fg text-center
  placeholder-fg-subtle focus:outline-hidden mono tabular-nums
  [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none
`
const wrapCls = `
  flex items-center bg-overlay/5 border border-overlay/10 rounded-xl overflow-hidden
  focus-within:border-brand/60 transition-all
`
const chipCls = (on: boolean) => `px-2 py-1 rounded-lg border text-[11px] font-medium transition-colors focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand/60 ${
  on ? 'border-brand/50 bg-brand/12 text-brand' : 'border-border text-fg-muted hover:text-fg hover:bg-overlay/5'}`

// Simulador de venta (#279, #280): FIFO de la wallet elegida, comisión e IRPF
// marginal; en dos columnas, con atajos de cantidad y precio, modo «importe a
// recibir» y gráfico del resultado según el precio.
export function SaleSimulatorModal({ asset, totalQty, currentPrice, onClose }: Props) {
  const titleId = useId()
  const livePrice = usePricesStore(s => s.prices[asset]) ?? currentPrice

  // Wallets con el activo: el motor fiscal aplica FIFO por wallet (#279).
  const { data: openLots } = useQuery({
    queryKey: ['open-lots', asset],
    queryFn: () => portfolioApi.getOpenLots(asset),
    staleTime: 60_000,
  })
  const wallets = useMemo(() => walletQuantities(openLots?.lots ?? []), [openLots])
  const [walletChoice, setWalletChoice] = useState<string | null>(null)
  const wallet = wallets.find(w => w.walletId === walletChoice) ?? wallets[0] ?? null
  const walletQty = wallet?.quantity ?? totalQty
  const breakEven = useMemo(() => walletBreakEven(openLots?.lots ?? [], wallet?.walletId), [openLots, wallet?.walletId])

  const [mode, setMode] = useState<Mode>('qty')
  // Cantidad: null = el máximo de la wallet elegida (vuelve a él al cambiarla).
  const [qtyInput, setQtyInput] = useState<string | null>(null)
  const qty = qtyInput ?? String(+walletQty.toPrecision(12))
  const [targetInput, setTargetInput] = useState('')
  const [price, setPrice] = useState(currentPrice > 0 ? currentPrice.toFixed(4) : '')
  // Comisión de venta en %, recordada en este navegador (#279).
  const [feeInput, setFeeInput] = useState(() => String(readFeePct()))
  const feePct = parseFeePct(feeInput)

  const debouncedQty    = useDebounce(qty, 350)
  const debouncedPrice  = useDebounce(price, 350)
  const debouncedFee    = useDebounce(feePct, 350)
  const debouncedTarget = useDebounce(targetInput, 450)
  const pNum = parseFloat(debouncedPrice)
  const targetNum = parseFloat(debouncedTarget.replace(',', '.'))

  // Modo «importe a recibir»: el backend calcula la cantidad con la misma regla fiscal.
  const { data: solved } = useQuery({
    queryKey: ['simulate-qty', asset, wallet?.walletId, pNum, debouncedFee, targetNum],
    queryFn: () => portfolioApi.simulateSaleQuantity(asset, pNum, targetNum, wallet?.walletId, debouncedFee),
    enabled: mode === 'net' && wallet !== null && pNum > 0 && targetNum > 0,
    retry: false,
  })
  const effectiveQty = mode === 'net' ? solved?.quantity ?? 0 : parseFloat(debouncedQty)

  const valid = effectiveQty > 0 && !isNaN(pNum) && pNum >= 0 && wallet !== null
  const { data, isFetching: loading, error: queryError } = useQuery({
    queryKey: ['simulate-sale', asset, wallet?.walletId, effectiveQty, pNum, debouncedFee],
    queryFn: () => portfolioApi.simulateSale(asset, effectiveQty, pNum, wallet?.walletId, debouncedFee),
    enabled: valid,
    retry: false,
    // Mantiene el resultado anterior visible mientras se recalcula.
    placeholderData: keepPreviousData,
  })
  const result = valid && !queryError ? data ?? null : null
  const error  = valid && queryError ? queryError.message : null

  // Curva del resultado según el precio: rango fijado al abrir (no con cada tick).
  const prices = useMemo(() => curvePrices(currentPrice, breakEven), [currentPrice, breakEven])
  const { data: curve } = useQuery({
    queryKey: ['simulate-curve', asset, wallet?.walletId, effectiveQty, debouncedFee, prices.length, prices.at(-1)],
    queryFn: () => portfolioApi.simulateSaleCurve(asset, effectiveQty, prices, wallet?.walletId, debouncedFee),
    enabled: valid && prices.length > 1,
    retry: false,
    placeholderData: keepPreviousData,
  })

  // Break-even de ESTA venta: coste de los lotes que se venden en FIFO (no el
  // medio de la wallet), que no depende del precio; antes de tener resultado,
  // el medio de la wallet como aproximación.
  const saleBe = result ? saleBreakEven(result.totalCostBasis, result.quantity, result.feePct) : saleBreakEven(breakEven ?? 0, 1, feePct)
  const scenarios = priceScenarios(livePrice, saleBe)
  const setPriceValue = (p: number) => setPrice(String(+p.toPrecision(8)))
  const qtyNum = parseFloat(qty) || 0
  const pct = pctOfWallet(qtyNum, walletQty)

  const stepQty = (dir: 1 | -1) => {
    const n = parseFloat(qty) || 0
    setQtyInput(String(Math.min(walletQty, Math.max(0, +(n + dir * calcStep(n)).toPrecision(8)))))
  }
  const stepPrice = (dir: 1 | -1) => {
    const n = parseFloat(price) || 0
    setPrice(String(Math.max(0, +(n + dir * calcStep(n)).toPrecision(8))))
  }

  const marginal = result?.irpf.marginal ?? 0
  const efectivo = result && result.netGainLoss > 0.005 && marginal > 0 ? (marginal / result.netGainLoss) * 100 : null

  return (
    <Modal onClose={onClose} labelledBy={titleId} size="xl">

      {/* Cabecera */}
      <div className="relative px-5 pt-5 pb-4 border-b border-border shrink-0 overflow-hidden">
        <div className="absolute inset-0 bg-linear-to-br from-brand/10 via-transparent to-transparent pointer-events-none" />
        <div className="relative flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <Calculator size={15} className="text-brand" aria-hidden="true" />
              <span className="text-[11px] font-medium text-brand tracking-wide uppercase">Simulador de venta</span>
              <EurOnlyBadge />
            </div>
            <h2 id={titleId} className="text-xl font-bold tracking-tight">{asset}</h2>
            <p className="text-xs text-fg-subtle mt-0.5">
              Disponible{wallet ? <> en <span className="text-fg">{wallet.walletName}</span></> : ''}: <span className="text-fg mono">{formatAmount(walletQty)} {asset}</span>
              {livePrice > 0 && <> · precio actual <span className="text-fg mono">{formatPrice(livePrice)}</span></>}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar" className={iconButtonClasses('md', false, 'mt-0.5')}>
            <X size={15} aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="overflow-y-auto flex-1 p-5">
        <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">

          {/* ── Datos de la venta ── */}
          <div className="space-y-5 min-w-0">
            <div>
              <label className="text-xs font-medium text-fg-muted mb-1.5 block">Wallet de venta</label>
              {wallets.length > 0 ? (
                <Dropdown label="Wallet de venta" value={wallet?.walletId ?? ''} className="w-full"
                  onChange={v => { setWalletChoice(v); setQtyInput(null) }}
                  options={wallets.map(w => ({ value: w.walletId, label: `${w.walletName} · ${formatAmount(w.quantity)}` }))} />
              ) : <p className="text-xs text-fg-subtle py-2">Cargando wallets…</p>}
              <p className="mt-1.5 text-[11px] text-fg-subtle">Se venden primero los lotes más antiguos de esta wallet (FIFO).</p>
            </div>

            <div className="space-y-2">
              <SegmentedControl label="Qué fijas" variant="accent" value={mode} onChange={setMode} options={MODE_OPTIONS} />
              {mode === 'qty' ? (
                <>
                  <label htmlFor={`${titleId}-qty`} className="sr-only">Cantidad a vender</label>
                  <div className={wrapCls}>
                    <StepButton label="−" onStep={() => stepQty(-1)} />
                    <input id={`${titleId}-qty`} type="number" step="any" min="0" max={walletQty}
                      value={qty} onChange={e => setQtyInput(e.target.value)} className={inputCls} />
                    <StepButton label="+" onStep={() => stepQty(1)} />
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap" role="group" aria-label="Cantidad rápida">
                    {QTY_PCTS.map(p => (
                      <button key={p} type="button" aria-pressed={Math.abs(pct - p) < 0.01}
                        onClick={() => setQtyInput(p === 100 ? null : String(qtyForPct(walletQty, p)))}
                        className={chipCls(Math.abs(pct - p) < 0.01)}>{p} %</button>
                    ))}
                  </div>
                  <input type="range" min={0} max={100} step={1} value={Math.round(pct)} aria-label="Porcentaje de lo disponible a vender"
                    aria-valuetext={`${Math.round(pct)} % de lo disponible`}
                    onChange={e => { const v = Number(e.target.value); setQtyInput(v === 100 ? null : String(qtyForPct(walletQty, v))) }}
                    className="w-full accent-brand" />
                </>
              ) : (
                <>
                  <label htmlFor={`${titleId}-target`} className="text-xs font-medium text-fg-muted block">Quiero recibir en mano (€)</label>
                  <div className={wrapCls}>
                    <input id={`${titleId}-target`} type="text" inputMode="decimal" placeholder="1000"
                      value={targetInput} onChange={e => setTargetInput(e.target.value)} className={inputCls} />
                  </div>
                  <p className="text-[11px] text-fg-subtle" aria-live="polite">
                    {!solved ? 'Tras comisión e IRPF de esta venta.'
                      : solved.alcanzable
                        ? <>Hay que vender <span className="mono text-fg">{formatAmount(solved.quantity)} {asset}</span> ({formatPercent(pctOfWallet(solved.quantity, walletQty), 1)} de lo disponible).</>
                        : <span className="text-warning">No alcanza: vendiendo todo recibirías {formatEur(solved.netoEnMano)}.</span>}
                  </p>
                </>
              )}
            </div>

            <div className="space-y-2">
              <label htmlFor={`${titleId}-price`} className="text-xs font-medium text-fg-muted block">Precio de venta (€/ud.)</label>
              <div className={wrapCls}>
                <StepButton label="−" onStep={() => stepPrice(-1)} />
                <input id={`${titleId}-price`} type="number" step="any" min="0" placeholder="0.0000"
                  value={price} onChange={e => setPrice(e.target.value)} className={inputCls} />
                <StepButton label="+" onStep={() => stepPrice(1)} />
              </div>
              <div className="flex items-center gap-1.5 flex-wrap" role="group" aria-label="Escenarios de precio">
                {scenarios.map(s => {
                  const on = Math.abs((parseFloat(price) || 0) - s.price) < s.price * 1e-6
                  return (
                    <button key={s.key} type="button" aria-pressed={on} onClick={() => setPriceValue(s.price)} className={chipCls(on)}
                      title={s.key === 'breakeven' ? 'Precio al que esta venta no gana ni pierde: coste de los lotes que se venden (FIFO) y la comisión' : undefined}>
                      {s.label} <span className="mono opacity-75">{formatPrice(s.price)}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            <div>
              <label htmlFor={`${titleId}-fee`} className="text-xs font-medium text-fg-muted mb-1.5 block">Comisión de venta (%)</label>
              <div className={`${wrapCls} max-w-40`}>
                <input id={`${titleId}-fee`} type="text" inputMode="decimal" value={feeInput}
                  onChange={e => setFeeInput(e.target.value)}
                  onBlur={() => { setFeeInput(String(feePct)); saveFeePct(feePct) }}
                  className={inputCls} />
              </div>
              <p className="mt-1.5 text-[11px] text-fg-subtle">Reduce el importe y la ganancia. Se recuerda.</p>
            </div>
          </div>

          {/* ── Resultado ── */}
          <div className="space-y-4 min-w-0">
            {error && (
              <div role="alert" className="flex items-center gap-2 px-3 py-2.5 bg-negative/10 border border-negative/25 rounded-xl text-xs text-negative">
                <AlertCircle size={13} className="shrink-0" aria-hidden="true" /> {error}
              </div>
            )}

            {loading && !result && (
              <div className="flex items-center justify-center gap-2 py-10 text-xs text-fg-subtle" role="status">
                <span className="inline-block w-3 h-3 border border-border border-t-brand rounded-full animate-spin motion-reduce:animate-none" />
                Calculando…
              </div>
            )}

            {result && (
              <>
                <div className={`rounded-xl border p-4 transition-opacity ${loading ? 'opacity-60' : ''} ${result.resultadoNeto >= 0 ? 'border-positive/20 bg-positive/5' : 'border-negative/20 bg-negative/5'}`}>
                  <p className="text-[11px] font-medium uppercase tracking-wide text-fg-muted">Neto en mano</p>
                  <p className="mono tabular-nums text-3xl font-bold text-fg break-all leading-tight">
                    <AnimatedNumber value={result.netoEnMano} format={formatEur} />
                  </p>
                  <dl className="grid grid-cols-3 gap-3 mt-3 tabular-nums">
                    <div className="min-w-0">
                      <dt className="text-[11px] text-fg-subtle truncate">Resultado neto</dt>
                      <dd className={`mono text-sm font-semibold break-words ${result.resultadoNeto >= 0 ? 'text-positive' : 'text-negative'}`}>
                        {result.resultadoNeto >= 0 ? '+' : ''}{formatEur(result.resultadoNeto)}
                      </dd>
                    </div>
                    <div className="min-w-0">
                      <dt className="text-[11px] text-fg-subtle truncate">{marginal < 0 ? 'Ahorro de IRPF' : 'IRPF'}</dt>
                      <dd className={`mono text-sm font-semibold break-words ${marginal < 0 ? 'text-positive' : 'text-warning'}`}>{formatEur(Math.abs(marginal))}</dd>
                    </div>
                    <div className="min-w-0">
                      <dt className="text-[11px] text-fg-subtle truncate">Tipo efectivo</dt>
                      <dd className="mono text-sm font-semibold text-fg">{efectivo !== null ? formatPercent(efectivo, 1) : '—'}</dd>
                    </div>
                  </dl>
                </div>

                {curve && (
                  <div className="rounded-xl border border-border p-3">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-fg-muted mb-1">Resultado según el precio de venta</p>
                    <SaleSimulatorChart points={curve.points} current={livePrice} breakEven={saleBe}
                      chosen={pNum} onPick={setPriceValue} />
                    <p className="text-[11px] text-fg-subtle mt-1">Pulsa sobre la curva para fijar ese precio.</p>
                  </div>
                )}

                <SaleSimulatorResults result={result} loading={loading} />
              </>
            )}
          </div>
        </div>
      </div>

      <div className="px-5 py-3 border-t border-border shrink-0">
        <button type="button" onClick={onClose}
          className="w-full py-2 text-sm text-fg-subtle hover:text-fg transition-colors rounded-xl hover:bg-overlay/5">
          Cerrar
        </button>
      </div>
    </Modal>
  )
}
