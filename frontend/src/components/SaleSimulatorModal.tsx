import { useId, useMemo, useState } from 'react'
import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { X, Calculator, AlertCircle, Copy } from 'lucide-react'
import { formatAmount, formatEur, formatPercent, formatPrice } from '../utils/format'
import { portfolioApi } from '../api/portfolio'
import { usePricesStore } from '../store/pricesStore'
import { useDebounce } from '../hooks/useDebounce'
import { StepButton } from './StepButton'
import { calcStep } from '../utils/calcStep'
import { SaleSimulatorChart } from './SaleSimulatorChart'
import { QueVendes } from './simulador/QueVendes'
import { QueRecibes } from './simulador/QueRecibes'
import { AvisosVenta } from './simulador/AvisosVenta'
import { InfoTooltip } from './InfoTooltip'
import { useToast } from '../hooks/useToast'
import { decimalesPrecio, formatNumeroLocal, parseNumeroLocal } from '../utils/numeroLocal'
import { resumenTexto } from '../utils/simuladorResumen'
import { EurOnlyBadge } from './EurOnlyBadge'
import { iconButtonClasses, Modal, Dropdown, SegmentedControl, Skeleton, SkeletonGroup, Hint, QueryError } from './ui'
import { parseFeePct, readFeePct, saveFeePct, walletQuantities } from '../utils/saleSimulator'
import { QTY_PCTS, curvePrices, pctOfWallet, priceScenarios, qtyForPct, saleBreakEven, walletBreakEven } from '../utils/saleSimulatorView'
import { failure } from '../utils/queryFailure'

interface Props {
  asset:        string
  totalQty:     number
  currentPrice: number
  onClose:      () => void
  /** Wallet con la que se abre (p. ej. desde el planificador, #307). */
  initialWalletId?: string
  /** Cantidad con la que se abre; por defecto, todo lo de la wallet. */
  initialQty?: number
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
  on ? 'border-brand/50 bg-brand/12 text-brand-ink' : 'border-border text-fg-muted hover:text-fg hover:bg-overlay/5'}`

// Simulador de venta (#279, #280, #529): FIFO global por activo (#476), comisión
// e IRPF marginal; en dos columnas, con atajos de cantidad y precio, modo
// «importe a recibir», campos en formato español, «Qué vendes» y «Qué
// recibes» (cascada hasta el neto en mano), curva con punto arrastrable,
// avisos con fechas y enlaces y «Copiar resumen».
const fmtQty = (n: number) => formatNumeroLocal(+n.toPrecision(12), 8)
const fmtPrecio = (n: number) => formatNumeroLocal(n, decimalesPrecio(n), 2)
export function SaleSimulatorModal({ asset, totalQty, currentPrice, onClose, initialWalletId, initialQty }: Props) {
  const titleId = useId()
  const livePrice = usePricesStore(s => s.prices[asset]) ?? currentPrice

  // Wallets con el activo: la elegida limita la cantidad; el coste sigue el FIFO global (#476).
  const openLotsQ = useQuery({
    queryKey: ['open-lots', asset],
    queryFn: () => portfolioApi.getOpenLots(asset),
    staleTime: 60_000,
  })
  const { data: openLots } = openLotsQ
  const wallets = useMemo(() => walletQuantities(openLots?.lots ?? []), [openLots])
  const [walletChoice, setWalletChoice] = useState<string | null>(initialWalletId ?? null)
  const wallet = wallets.find(w => w.walletId === walletChoice) ?? wallets[0] ?? null
  const walletQty = wallet?.quantity ?? totalQty
  // Cálculo barato: sin memoizar (el compilador de React ya optimiza el componente).
  const breakEven = walletBreakEven(openLots?.lots ?? [], wallet?.walletId)

  const [mode, setMode] = useState<Mode>('qty')
  // Cantidad: null = el máximo de la wallet elegida (vuelve a él al cambiarla).
  const toast = useToast()
  const [qtyInput, setQtyInput] = useState<string | null>(initialQty !== undefined && initialQty > 0 ? fmtQty(initialQty) : null)
  const qty = qtyInput ?? fmtQty(walletQty)
  const [targetInput, setTargetInput] = useState('')
  const [price, setPrice] = useState(currentPrice > 0 ? fmtPrecio(currentPrice) : '')
  // Comisión de venta en %, recordada en este navegador (#279).
  const [feeInput, setFeeInput] = useState(() => formatNumeroLocal(readFeePct(), 3))
  const feeParsed = parseNumeroLocal(feeInput)
  const feePct = parseFeePct(feeParsed === null ? null : String(feeParsed))
  // Campos en formato español (#529): valores no válidos se señalan con texto.
  const qtyParsed = parseNumeroLocal(qty)
  const priceParsed = parseNumeroLocal(price)
  const qtyError = qty.trim() !== '' && (qtyParsed === null || qtyParsed < 0) ? 'Escribe una cantidad válida, por ejemplo 1,5' : null
  const priceError = price.trim() !== '' && (priceParsed === null || priceParsed < 0) ? 'Escribe un precio válido, por ejemplo 0,52' : null
  const feeError = feeInput.trim() !== '' && (feeParsed === null || feeParsed < 0 || feeParsed > 10) ? 'Entre 0 y 10 %' : null

  const debouncedQty    = useDebounce(qty, 350)
  const debouncedPrice  = useDebounce(price, 350)
  const debouncedFee    = useDebounce(feePct, 350)
  const debouncedTarget = useDebounce(targetInput, 450)
  const pNum = parseNumeroLocal(debouncedPrice) ?? NaN
  const targetNum = parseNumeroLocal(debouncedTarget) ?? NaN

  // Modo «importe a recibir»: el backend calcula la cantidad con la misma regla fiscal.
  const solvedQ = useQuery({
    queryKey: ['simulate-qty', asset, wallet?.walletId, pNum, debouncedFee, targetNum],
    queryFn: () => portfolioApi.simulateSaleQuantity(asset, pNum, targetNum, wallet?.walletId, debouncedFee),
    enabled: mode === 'net' && wallet !== null && pNum > 0 && targetNum > 0,
    retry: false,
  })
  const { data: solved } = solvedQ
  const effectiveQty = mode === 'net' ? solved?.quantity ?? 0 : parseNumeroLocal(debouncedQty) ?? 0

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
  const curveQ = useQuery({
    queryKey: ['simulate-curve', asset, wallet?.walletId, effectiveQty, debouncedFee, prices.length, prices.at(-1)],
    queryFn: () => portfolioApi.simulateSaleCurve(asset, effectiveQty, prices, wallet?.walletId, debouncedFee),
    enabled: valid && prices.length > 1,
    retry: false,
    placeholderData: keepPreviousData,
  })
  const { data: curve } = curveQ

  // Break-even de ESTA venta: coste de los lotes que se venden en FIFO (no el
  // medio de la wallet), que no depende del precio; antes de tener resultado,
  // el medio de la wallet como aproximación.
  const saleBe = result ? saleBreakEven(result.totalCostBasis, result.quantity, result.feePct) : saleBreakEven(breakEven ?? 0, 1, feePct)
  const scenarios = priceScenarios(livePrice, saleBe)
  const setPriceValue = (p: number) => setPrice(fmtPrecio(+p.toPrecision(8)))
  const qtyNum = qtyParsed ?? 0
  const pct = pctOfWallet(qtyNum, walletQty)

  const stepQty = (dir: 1 | -1) => {
    const n = qtyParsed ?? 0
    setQtyInput(fmtQty(Math.min(walletQty, Math.max(0, +(n + dir * calcStep(n)).toPrecision(8)))))
  }
  const stepPrice = (dir: 1 | -1) => {
    const n = priceParsed ?? 0
    setPriceValue(Math.max(0, +(n + dir * calcStep(n)).toPrecision(8)))
  }

  // Resumen en texto plano (#529): solo la wallet de venta, nada de las demás.
  async function copiarResumen() {
    if (!result || !wallet) return
    try {
      await navigator.clipboard.writeText(resumenTexto(result, { walletName: wallet.walletName, fecha: new Date() }))
      toast.success('Resumen de la simulación copiado')
    } catch (e) { toast.fail('No se pudo copiar el resumen', e) }
  }

  // Lotes, precio de equilibrio y curva (#498): sin ellos la simulación no es fiable.
  const falloDatos = failure(openLotsQ, solvedQ, curveQ)
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
              ) : <SkeletonGroup label="Cargando las wallets"><Skeleton className="h-9 w-full" /></SkeletonGroup>}
              <p className="mt-1.5 text-[11px] text-fg-subtle">Salen primero los lotes más antiguos del activo, estén en la wallet que estén (FIFO global).</p>
            </div>

            <div className="space-y-2">
              <SegmentedControl label="Qué fijas" variant="accent" value={mode} onChange={setMode} options={MODE_OPTIONS} />
              {mode === 'qty' ? (
                <>
                  <label htmlFor={`${titleId}-qty`} className="sr-only">Cantidad a vender</label>
                  <div className={wrapCls}>
                    <StepButton label="−" onStep={() => stepQty(-1)} />
                    <input id={`${titleId}-qty`} type="text" inputMode="decimal" autoComplete="off"
                      aria-invalid={!!qtyError} aria-describedby={qtyError ? `${titleId}-qty-error` : undefined}
                      value={qty} onChange={e => setQtyInput(e.target.value)}
                      onBlur={() => { if (qtyParsed !== null && qtyParsed >= 0) setQtyInput(fmtQty(Math.min(qtyParsed, walletQty))) }}
                      className={inputCls} />
                    <StepButton label="+" onStep={() => stepQty(1)} />
                  </div>
                  {qtyError && <p id={`${titleId}-qty-error`} role="alert" className="text-[11px] text-negative-ink">{qtyError}</p>}
                  <div className="flex items-center gap-1.5 flex-wrap" role="group" aria-label="Cantidad rápida">
                    {QTY_PCTS.map(p => (
                      <button key={p} type="button" aria-pressed={Math.abs(pct - p) < 0.01}
                        onClick={() => setQtyInput(p === 100 ? null : fmtQty(qtyForPct(walletQty, p)))}
                        className={chipCls(Math.abs(pct - p) < 0.01)}>{p} %</button>
                    ))}
                  </div>
                  <input type="range" min={0} max={100} step={1} value={Math.round(pct)} aria-label="Porcentaje de lo disponible a vender"
                    aria-valuetext={`${Math.round(pct)} % de lo disponible`}
                    onChange={e => { const v = Number(e.target.value); setQtyInput(v === 100 ? null : fmtQty(qtyForPct(walletQty, v))) }}
                    className="w-full accent-brand" />
                </>
              ) : (
                <>
                  <label htmlFor={`${titleId}-target`} className="text-xs font-medium text-fg-muted block">Quiero recibir en mano (€)</label>
                  <div className={wrapCls}>
                    <input id={`${titleId}-target`} type="text" inputMode="decimal" placeholder="1.000"
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
                <input id={`${titleId}-price`} type="text" inputMode="decimal" autoComplete="off" placeholder="0,0000"
                  aria-invalid={!!priceError} aria-describedby={priceError ? `${titleId}-price-error` : undefined}
                  value={price} onChange={e => setPrice(e.target.value)}
                  onBlur={() => { if (priceParsed !== null && priceParsed >= 0) setPriceValue(priceParsed) }}
                  className={inputCls} />
                <StepButton label="+" onStep={() => stepPrice(1)} />
              </div>
              {priceError && <p id={`${titleId}-price-error`} role="alert" className="text-[11px] text-negative-ink">{priceError}</p>}
              <div className="flex items-center gap-1.5 flex-wrap" role="group" aria-label="Escenarios de precio">
                {scenarios.map(s => {
                  const on = Math.abs((priceParsed ?? 0) - s.price) < s.price * 1e-4
                  const chip = (
                    <button key={s.key} type="button" aria-pressed={on} onClick={() => setPriceValue(s.price)} className={chipCls(on)}>
                      {s.label} <span className="mono">{formatPrice(s.price)}</span>
                    </button>
                  )
                  return s.key === 'breakeven'
                    ? <Hint key={s.key} label="Precio al que esta venta no gana ni pierde: coste de los lotes que se venden (FIFO) y la comisión">{chip}</Hint>
                    : chip
                })}
              </div>
            </div>

            <div>
              <label htmlFor={`${titleId}-fee`} className="text-xs font-medium text-fg-muted mb-1.5 block">Comisión de venta (%)</label>
              <div className={`${wrapCls} max-w-40`}>
                <input id={`${titleId}-fee`} type="text" inputMode="decimal" value={feeInput}
                  aria-invalid={!!feeError} aria-describedby={feeError ? `${titleId}-fee-error` : undefined}
                  onChange={e => setFeeInput(e.target.value)}
                  onBlur={() => { setFeeInput(formatNumeroLocal(feePct, 3)); saveFeePct(feePct) }}
                  className={inputCls} />
              </div>
              {feeError && <p id={`${titleId}-fee-error`} role="alert" className="mt-1 text-[11px] text-negative-ink">{feeError}. Se usará {formatNumeroLocal(feePct, 3)} %.</p>}
              <p className="mt-1.5 text-[11px] text-fg-subtle">Reduce el importe y la ganancia. Se recuerda.</p>
            </div>
          </div>

          {/* ── Resultado ── */}
          <div className="space-y-4 min-w-0">
            {falloDatos && <QueryError what="los datos de la simulación" error={falloDatos.error} onRetry={falloDatos.retry} />}
            {error && (
              <div role="alert" className="flex items-center gap-2 px-3 py-2.5 bg-negative/10 border border-negative/25 rounded-xl text-xs text-negative">
                <AlertCircle size={13} className="shrink-0" aria-hidden="true" /> {error}
              </div>
            )}

            {loading && !result && (
              <SkeletonGroup label="Calculando el resultado" className="space-y-3">
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-16 w-full" />
              </SkeletonGroup>
            )}

            {result && (
              <>
                <QueVendes result={result} walletName={wallet?.walletName ?? ''} />
                <QueRecibes result={result} breakEven={saleBe} loading={loading} />
                {curve && (
                  <section aria-labelledby={`${titleId}-curva`} className="rounded-xl border border-border p-3 space-y-1">
                    <div className="flex items-center gap-1.5">
                      <h3 id={`${titleId}-curva`} className="text-[11px] font-semibold uppercase tracking-widest text-fg-subtle">Resultado según el precio de venta</h3>
                      <InfoTooltip label="Qué muestra la curva">
                        <p>Para la cantidad elegida, cuánto ganarías o perderías tras la comisión y el IRPF a cada precio de venta.</p>
                        <p className="mt-1.5">Por encima de la línea del cero ganas; por debajo pierdes. La raya «Actual» es el precio de ahora y «Break-even», el precio al que esta venta no gana ni pierde.</p>
                        <p className="mt-1.5 text-fg-subtle">La curva se dobla donde el IRPF cambia de tramo.</p>
                      </InfoTooltip>
                    </div>
                    <SaleSimulatorChart points={curve.points} current={livePrice} breakEven={saleBe}
                      chosen={priceParsed ?? 0} onPick={setPriceValue} />
                    <p className="text-[11px] text-fg-subtle">Arrastra el punto o pulsa en la curva para fijar el precio; con el foco en ella, flechas (1 %), Mayús y flechas (10 %) e Inicio (precio actual).</p>
                  </section>
                )}
                <AvisosVenta result={result} onNavegar={onClose} />
              </>
            )}
          </div>
        </div>
      </div>

      <div className="px-5 py-3 border-t border-border shrink-0 flex items-center gap-2">
        <button type="button" onClick={() => void copiarResumen()} disabled={!result}
          className="flex items-center justify-center gap-1.5 px-4 py-2 text-sm rounded-xl border border-border text-fg hover:bg-overlay/5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-brand">
          <Copy size={14} aria-hidden="true" /> Copiar resumen
        </button>
        <button type="button" onClick={onClose}
          className="flex-1 py-2 text-sm text-fg-subtle hover:text-fg transition-colors rounded-xl hover:bg-overlay/5">
          Cerrar
        </button>
      </div>
    </Modal>
  )
}
