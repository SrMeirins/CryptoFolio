import { useEffect, useId, useMemo, useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Calculator } from 'lucide-react'
import { portfolioApi, type OpenLot } from '../../../api/portfolio'
import { Button, fieldClasses, QueryError, segmentClasses } from '../../../components/ui'
import { useDebounce } from '../../../hooks/useDebounce'
import { usePricesStore } from '../../../store/pricesStore'
import { formatAmount, formatMoney, pnlColor } from '../../../utils/format'
import { formatLotDate } from '../../../utils/portfolioLots'
import { readFeePct, walletQuantities } from '../../../utils/saleSimulator'
import { parseSellQuantity, QUICK_SHARES, shareQuantity, siVendoResumen } from '../../../utils/siVendo'

// «Si vendo X» (#528): qué lotes saldrían y con qué resultado. Usa el mismo
// cálculo que el simulador de venta (POST /fiscal/simulate-sale: FIFO global,
// comisión recordada y precio en vivo en EUR), así que da lo mismo. Como en el
// simulador, una venta sale de una wallet: la cantidad tiene ese tope.

export function SiVendo({ asset, lots, onLots, onSimulate }: {
  asset: string
  lots: readonly OpenLot[]
  /** Ids de los lotes que saldrían, para resaltarlos en la lista; vacío sin cálculo. */
  onLots: (ids: ReadonlySet<string>) => void
  onSimulate: (quantity: number, walletId: string) => void
}) {
  const id = useId()
  const wallets = useMemo(() => walletQuantities(lots), [lots])
  const [walletChoice, setWalletChoice] = useState<string | null>(null)
  const wallet = wallets.find(w => w.walletId === walletChoice) ?? wallets[0] ?? null
  const max = wallet?.quantity ?? 0
  const [raw, setRaw] = useState('')
  const quantity = parseSellQuantity(raw, max)
  const debounced = useDebounce(quantity, 350)
  const priceEur = usePricesStore(s => s.prices[asset]) ?? 0
  // El precio se fija al lanzar el cálculo; no se recalcula con cada tick en vivo.
  const [priceAt, setPriceAt] = useState(priceEur)
  if (priceAt === 0 && priceEur > 0) setPriceAt(priceEur)
  const [feePct] = useState(readFeePct)

  const enabled = debounced !== null && wallet !== null && priceAt > 0
  const simQ = useQuery({
    queryKey: ['simulate-sale', asset, wallet?.walletId, debounced, priceAt, feePct],
    queryFn: () => portfolioApi.simulateSale(asset, debounced ?? 0, priceAt, wallet?.walletId, feePct),
    enabled,
    retry: false,
    placeholderData: keepPreviousData,
  })
  const resumen = useMemo(() => (enabled && simQ.data ? siVendoResumen(simQ.data) : null), [enabled, simQ.data])

  useEffect(() => { onLots(resumen?.lotIds ?? new Set()) }, [resumen, onLots])

  const elegir = (pct: number) => { setRaw(String(+shareQuantity(max, pct).toPrecision(12))); setPriceAt(priceEur) }
  const pctActivo = quantity !== null && max > 0 ? QUICK_SHARES.find(p => Math.abs(shareQuantity(max, p) - quantity) < 1e-9) : undefined

  if (!wallet) return null
  return (
    <div className="rounded-xl border border-border bg-overlay/2 px-3 py-3 space-y-3" data-testid="si-vendo">
      <h4 className="text-xs font-semibold text-fg">Si vendo...</h4>
      <div className="flex items-end gap-2 flex-wrap">
        <div className="space-y-1">
          <label htmlFor={`${id}-qty`} className="block text-[11px] text-fg-muted">Cantidad de {asset}</label>
          <input id={`${id}-qty`} inputMode="decimal" autoComplete="off" value={raw} placeholder={formatAmount(max)}
            onChange={e => { setRaw(e.target.value); setPriceAt(priceEur) }}
            aria-describedby={`${id}-hint`} className={fieldClasses('sm', raw !== '' && quantity === null, 'w-40 mono tabular-nums')} />
        </div>
        <div role="group" aria-label="Parte de la posición" className="flex gap-1">
          {QUICK_SHARES.map(p => (
            <button key={p} type="button" onClick={() => elegir(p)} aria-pressed={pctActivo === p} className={segmentClasses(pctActivo === p)}>
              {p} %
            </button>
          ))}
        </div>
        {wallets.length > 1 && (
          <div className="space-y-1">
            <label htmlFor={`${id}-wallet`} className="block text-[11px] text-fg-muted">Desde la wallet</label>
            <select id={`${id}-wallet`} value={wallet.walletId} onChange={e => { setWalletChoice(e.target.value); setRaw('') }}
              className={fieldClasses('sm', false, 'w-44')}>
              {wallets.map(w => <option key={w.walletId} value={w.walletId}>{w.walletName} ({formatAmount(w.quantity)})</option>)}
            </select>
          </div>
        )}
      </div>
      <p id={`${id}-hint`} className="text-[11px] text-fg-subtle">
        Hasta {formatAmount(max)} en {wallet.walletName}. Mismo cálculo que el simulador: sale primero el lote más antiguo de
        cualquier wallet (FIFO global), al precio en vivo y con la comisión del simulador ({String(feePct).replace('.', ',')} %).
      </p>
      {raw !== '' && quantity === null && <p className="text-[11px] text-negative-ink" role="alert">Escribe una cantidad mayor que 0.</p>}
      {priceAt <= 0 && <p className="text-[11px] text-fg-subtle">Sin precio en vivo para calcularlo.</p>}
      {enabled && simQ.isError && <QueryError what="el cálculo de la venta" error={simQ.error} onRetry={() => void simQ.refetch()} />}
      {resumen && (
        <div aria-live="polite" className="space-y-2">
          <p className="text-xs text-fg-muted">
            Saldrían <strong className="text-fg">{resumen.lots} {resumen.lots === 1 ? 'lote' : 'lotes'}</strong>
            {resumen.firstOpenedAt && resumen.lastOpenedAt && (
              resumen.firstOpenedAt === resumen.lastOpenedAt
                ? <> (del {formatLotDate(resumen.firstOpenedAt)})</>
                : <> (del {formatLotDate(resumen.firstOpenedAt)} al {formatLotDate(resumen.lastOpenedAt)})</>
            )}
            {resumen.partial && ', el último solo en parte'}. Están resaltados en la lista de lotes.
          </p>
          <dl className="grid grid-cols-2 sm:grid-cols-4 gap-2 mono tabular-nums text-sm">
            <div className="min-w-0"><dt className="text-[10px] font-sans text-fg-subtle">Importe</dt><dd className="text-fg truncate">{formatMoney(resumen.proceedsEur, 'EUR')}</dd></div>
            <div className="min-w-0"><dt className="text-[10px] font-sans text-fg-subtle">Coste FIFO</dt><dd className="text-fg truncate">{formatMoney(resumen.costEur, 'EUR')}</dd></div>
            <div className="min-w-0"><dt className="text-[10px] font-sans text-fg-subtle">Comisión</dt><dd className="text-fg truncate">{formatMoney(resumen.feeEur, 'EUR')}</dd></div>
            <div className="min-w-0"><dt className="text-[10px] font-sans text-fg-subtle">Resultado</dt>
              <dd className={`font-semibold truncate ${pnlColor(resumen.resultEur)}`}>
                {resumen.resultEur >= 0 ? '+' : ''}{formatMoney(resumen.resultEur, 'EUR')}
                <span className="sr-only">{resumen.resultEur >= 0 ? ' (ganancia)' : ' (pérdida)'}</span>
              </dd></div>
          </dl>
          <p className="text-[11px] text-fg-subtle">Cifras fiscales en EUR, como en el simulador.</p>
          <Button variant="secondary" size="sm" onClick={() => quantity !== null && onSimulate(quantity, wallet.walletId)}>
            <Calculator size={14} aria-hidden="true" /> Abrir en el simulador
          </Button>
        </div>
      )}
    </div>
  )
}
