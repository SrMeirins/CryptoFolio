import { useId, useMemo, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Calculator, Lock, X } from 'lucide-react'
import { portfolioApi, type LockedAmount } from '../../api/portfolio'
import { CryptoIcon } from '../../components/CryptoIcon'
import { BreakEvenCell } from '../../components/BreakEvenCell'
import { PnlPill } from '../../components/AssetTableCells'
import { Button, Drawer, Skeleton, iconButtonClasses } from '../../components/ui'
import { OP_META } from '../../constants/operations'
import { formatAmount, formatMoney, formatPercent, formatPrice, pnlColor, type Currency } from '../../utils/format'
import type { CryptoRow } from '../../utils/assetTable'
import { breakEvenDistance } from '../../utils/portfolioView'
import { recoveryText } from '../../utils/fxEffect'
import { InfoTooltip } from '../../components/InfoTooltip'
import { formatAge, lotSourceLabel, lotsView } from '../../utils/portfolioLots'
import { ink } from '../../utils/colors'

// Panel de detalle de un activo en Portfolio (#272): resumen con break-even
// y simulador, reparto por wallet con lo bloqueado y los lotes FIFO abiertos,
// con el próximo que se vendería en cada wallet destacado.

const SHORT_DATE = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', year: '2-digit', timeZone: 'Europe/Madrid' })

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-overlay/2 px-3 py-2 min-w-0">
      <dt className="text-[10px] uppercase tracking-wider text-fg-subtle">{label}</dt>
      <dd className="mono tabular-nums text-sm font-semibold text-fg mt-0.5 truncate">{children}</dd>
    </div>
  )
}

export function AssetDetailPanel({ row, price, change24h, currency, rate, locked, onSimulate, onClose }: {
  row: CryptoRow
  /** Precio en la moneda de visualización. */
  price: number
  change24h: number | null
  currency: Currency
  rate: number | null
  locked: LockedAmount[]
  onSimulate: () => void
  onClose: () => void
}) {
  const titleId = useId()
  const closeRef = useRef<HTMLButtonElement>(null)
  const { data, isLoading, isError } = useQuery({
    queryKey: ['open-lots', row.asset],
    queryFn: () => portfolioApi.getOpenLots(row.asset),
    staleTime: 60_000,
  })
  const lots = useMemo(() => lotsView(data?.lots ?? [], price, currency, rate), [data, price, currency, rate])

  const hasPrice = price > 0
  const pnl = hasPrice ? row.value - row.totalCostBasis : null
  const pnlPct = pnl !== null && row.totalCostBasis > 0 ? (pnl / row.totalCostBasis) * 100 : null
  const avg = row.totalQuantity > 0 ? row.totalCostBasis / row.totalQuantity : null
  const distance = avg !== null ? breakEvenDistance(price, avg) : null

  return (
    <Drawer onClose={onClose} labelledBy={titleId} initialFocusRef={closeRef}>
      {/* Cabecera */}
      <div className="flex items-start gap-3 px-5 py-4 border-b border-border">
        <CryptoIcon symbol={row.asset} size={40} />
        <div className="min-w-0 flex-1">
          <h2 id={titleId} className="text-lg font-semibold text-fg leading-tight">{row.asset}</h2>
          <p className="flex items-center gap-2 mt-0.5 mono tabular-nums text-sm">
            <span className="text-fg">{hasPrice ? formatPrice(price, currency) : 'Sin precio'}</span>
            {change24h !== null && (
              <span className={`text-[11px] font-semibold px-1.5 py-0.5 rounded-md border ${change24h >= 0 ? 'text-positive bg-positive/8 border-positive/25' : 'text-negative bg-negative/8 border-negative/25'}`}>
                <span className="font-medium opacity-75">24 h</span> {change24h >= 0 ? '▲' : '▼'} {formatPercent(change24h, 2, true)}
              </span>
            )}
          </p>
        </div>
        <button ref={closeRef} type="button" onClick={onClose} aria-label="Cerrar el detalle" className={iconButtonClasses('md')}>
          <X size={16} aria-hidden="true" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">
        {/* Resumen y break-even */}
        <section aria-labelledby={`${titleId}-resumen`} className="space-y-3">
          <h3 id={`${titleId}-resumen`} className="text-[11px] font-semibold uppercase tracking-widest text-fg-subtle">Resumen</h3>
          <dl className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <Stat label="Cantidad">{formatAmount(row.totalQuantity)}</Stat>
            <Stat label="Valor">{hasPrice ? formatMoney(row.value, currency) : '—'}</Stat>
            <Stat label="Coste base">{formatMoney(row.totalCostBasis, currency)}</Stat>
            <Stat label="P&L no realizado">
              {pnl !== null ? <span className={pnlColor(pnl)}>{pnl >= 0 ? '+' : ''}{formatMoney(pnl, currency)}</span> : '—'}
            </Stat>
            <Stat label="Rentabilidad">{pnlPct !== null ? <span className={pnlColor(pnlPct)}>{formatPercent(pnlPct, 2, true)}</span> : '—'}</Stat>
            <Stat label="Precio medio">{avg !== null ? formatPrice(avg, currency) : '—'}</Stat>
          </dl>
          <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-overlay/2 px-3 py-2.5">
            <div className="text-xs text-fg-muted">
              {distance === null
                ? 'Sin precio actual para calcular el break-even.'
                : distance.pct >= 0
                  ? <>En beneficio: el precio está un <span className="mono text-positive">{formatPercent(distance.pct, 1)}</span> por encima de tu precio medio.</>
                  : <>Para recuperar lo invertido, el precio tiene que subir un <span className="mono text-negative">{formatPercent(distance.toRecover, 1)}</span>{' '}
                      <InfoTooltip label="Por qué la subida es mayor que la caída">
                        <p>{recoveryText(distance.pct)}</p>
                        <p className="mt-1.5 text-fg-subtle">Ejemplo: tras caer un 50 %, hace falta subir un 100 % para volver al precio inicial.</p>
                      </InfoTooltip>.</>}
            </div>
            <div className="shrink-0"><BreakEvenCell price={price} avgPrice={avg} currency={currency} /></div>
          </div>
          <Button variant="primary" size="sm" onClick={onSimulate} disabled={!hasPrice}>
            <Calculator size={14} aria-hidden="true" /> Simular venta
          </Button>
        </section>

        {/* Reparto por wallet y bloqueado */}
        <section aria-labelledby={`${titleId}-reparto`} className="space-y-2">
          <h3 id={`${titleId}-reparto`} className="text-[11px] font-semibold uppercase tracking-widest text-fg-subtle">Reparto por wallet</h3>
          <ul className="space-y-2">
            {row.wallets.map(w => {
              const value = w.quantity * price
              const share = row.totalQuantity > 0 ? (w.quantity / row.totalQuantity) * 100 : 0
              const wLocked = locked.filter(l => l.wallet_id === w.wallet_id)
              return (
                <li key={w.wallet_id} className="rounded-xl border border-border px-3 py-2 space-y-1.5">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: w.wallet_color }} aria-hidden="true" />
                    <span className="font-medium truncate" style={{ color: ink(w.wallet_color) }}>{w.wallet_name}</span>
                    <span className="ml-auto mono tabular-nums text-xs text-fg-muted">{formatAmount(w.quantity)}</span>
                    <span className="mono tabular-nums text-xs text-fg w-24 text-right">{hasPrice ? formatMoney(value, currency) : '—'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="flex-1 h-1 rounded-full bg-overlay/6 overflow-hidden" aria-hidden="true">
                      <span className="block h-full rounded-full" style={{ width: `${share}%`, backgroundColor: w.wallet_color }} />
                    </span>
                    <span className="mono text-[11px] text-fg-subtle w-12 text-right">{formatPercent(share, 1)}</span>
                  </div>
                  {wLocked.map((l, i) => (
                    <p key={i} className={`flex items-center gap-1.5 text-[11px] ${l.lock_kind === 'launchpool' ? 'text-accent-purple' : 'text-warning'}`}>
                      <Lock size={10} aria-hidden="true" />
                      {formatAmount(parseFloat(l.locked_amount))} bloqueado en {l.lock_kind === 'launchpool' ? 'launchpool' : 'staking'} · {l.staking_type}
                    </p>
                  ))}
                </li>
              )
            })}
          </ul>
        </section>

        {/* Lotes FIFO */}
        <section aria-labelledby={`${titleId}-lotes`} className="space-y-2">
          <h3 id={`${titleId}-lotes`} className="text-[11px] font-semibold uppercase tracking-widest text-fg-subtle">
            Lotes FIFO abiertos{data ? ` (${lots.length})` : ''}
          </h3>
          <p className="text-[11px] text-fg-subtle">En cada wallet se vende primero el lote más antiguo; está marcado como «Siguiente».</p>
          {isLoading && <div role="status" aria-label="Cargando los lotes" className="space-y-2">{[0, 1, 2].map(i => <Skeleton key={i} className="h-14 rounded-xl" />)}</div>}
          {isError && <p className="text-xs text-fg-subtle">No se pudieron cargar los lotes.</p>}
          {data && lots.length === 0 && <p className="text-xs text-fg-subtle">No hay lotes abiertos.</p>}
          <ul className="space-y-2">
            {lots.map((l, i) => (
              <li key={`${l.walletId}-${l.openedAt}-${i}`}
                className={`rounded-xl border px-3 py-2.5 grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 ${l.next ? 'border-brand/40 bg-brand/5' : 'border-border'}`}>
                <div className="flex items-center gap-2 min-w-0 text-xs">
                  <span className="mono text-fg">{SHORT_DATE.format(new Date(l.openedAt)).replace('.', '')}</span>
                  <span className="text-fg-subtle">· {formatAge(l.ageDays)}</span>
                  <span className="truncate" style={{ color: ink(l.walletColor) }}>{l.walletName}</span>
                  {l.next && (
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-brand/12 text-brand shrink-0"
                      title="Es el primero que se vendería en esta wallet (FIFO)">Siguiente</span>
                  )}
                </div>
                <div className="text-right mono tabular-nums text-xs">
                  {l.pnl !== null
                    ? <span className={pnlColor(l.pnl)}>{l.pnl >= 0 ? '+' : ''}{formatMoney(l.pnl, currency)}</span>
                    : <span className="text-fg-subtle">—</span>}
                </div>
                <div className="text-[11px] text-fg-subtle mono tabular-nums truncate">
                  {formatAmount(l.quantity)}{l.partial && <span title="Ya se vendió una parte del lote"> de {formatAmount(l.quantityOriginal)}</span>}
                  {' × '}{formatPrice(l.unitCost, currency)} = {formatMoney(l.cost, currency)}
                  <span className="ml-1.5">· {lotSourceLabel(l.source, OP_META)}</span>
                </div>
                <div className="text-right">{l.pnlPct !== null && <PnlPill pct={l.pnlPct} />}</div>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </Drawer>
  )
}
