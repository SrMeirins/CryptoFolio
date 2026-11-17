import { useMemo, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { PnlPill } from '../../../components/AssetTableCells'
import { TextTooltip } from '../../../components/ui'
import { OP_META } from '../../../constants/operations'
import { formatAmount, formatMoney, formatPrice, pnlColor, type Currency } from '../../../utils/format'
import { lotsByMonth } from '../../../utils/lotsByMonth'
import { formatAge, formatLotDate, lotDateDetail, lotOriginPrefix, lotSourceLabel, type LotView } from '../../../utils/portfolioLots'
import { ink } from '../../../utils/colors'

// Lotes abiertos agrupados por mes de compra (#528). Cada grupo resume
// cantidad, coste y resultado y se despliega en una tabla con sus lotes. El
// primero que se vendería lleva «Siguiente»; los que saldrían con «Si vendo»
// llevan «Saldría» (texto, además del resaltado).

function Origen({ lot }: { lot: LotView }) {
  const prefix = lotOriginPrefix(lot.source)
  const texto = prefix && lot.sourceWalletName
    ? <>{prefix} <span style={lot.sourceWalletColor ? { color: ink(lot.sourceWalletColor) } : undefined}>{lot.sourceWalletName}</span></>
    : <>{lotSourceLabel(lot.source, OP_META)}</>
  if (lot.trozos < 2) return texto
  return (
    <>{texto}{' '}
      <TextTooltip label="Compra en varios trozos"
        tip="La misma compra llegó en varios lotes, por ejemplo al pagar la comisión de red de una retirada con el propio activo: el FIFO global cobra la comisión del lote más antiguo y reubica esa cantidad desde esta compra. Se muestran unidos; el cálculo no cambia.">
        <span className="underline decoration-dotted">({lot.trozos} trozos)</span>
      </TextTooltip>
    </>
  )
}

export function LotesPorMes({ lots, currency, saldrian }: {
  lots: readonly LotView[]
  currency: Currency
  /** Ids de los lotes que saldrían con «Si vendo X». */
  saldrian: ReadonlySet<string>
}) {
  const groups = useMemo(() => lotsByMonth(lots), [lots])
  // El grupo con el próximo lote empieza abierto; con «Si vendo», los que tienen lotes que saldrían.
  const [abiertos, setAbiertos] = useState<ReadonlySet<string>>(() => new Set(groups.filter(g => g.next).map(g => g.key)))
  const toggle = (key: string) => setAbiertos(prev => {
    const next = new Set(prev)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    return next
  })

  return (
    <ul className="space-y-2" aria-label="Lotes abiertos por mes de compra">
      {groups.map(g => {
        const nSaldrian = g.lots.filter(l => l.lotIds.some(id => saldrian.has(id))).length
        const open = abiertos.has(g.key) || nSaldrian > 0
        const panelId = `lotes-${g.key}`
        return (
          <li key={g.key} className={`rounded-xl border ${nSaldrian > 0 ? 'border-warning/50' : g.next ? 'border-brand/40' : 'border-border'}`}>
            <button type="button" onClick={() => toggle(g.key)} aria-expanded={open} aria-controls={panelId}
              className="w-full flex items-center gap-2 px-3 py-2 text-left rounded-xl hover:bg-overlay/4 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-brand">
              <ChevronDown size={14} aria-hidden="true" className={`shrink-0 text-fg-subtle transition-transform ${open ? '' : '-rotate-90'}`} />
              <span className="text-xs font-medium text-fg">{g.label}</span>
              <span className="text-[11px] text-fg-subtle">{g.lots.length} {g.lots.length === 1 ? 'lote' : 'lotes'}</span>
              {g.next && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-brand/12 text-brand-ink">Siguiente</span>}
              {nSaldrian > 0 && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-warning/12 text-warning-ink">Saldrían {nSaldrian}</span>}
              <span className="ml-auto mono tabular-nums text-[11px] text-fg-muted whitespace-nowrap">{formatAmount(g.quantity)}</span>
              <span className="mono tabular-nums text-[11px] text-fg-muted w-20 text-right whitespace-nowrap">{formatMoney(g.cost, currency)}</span>
              <span className={`mono tabular-nums text-xs w-20 text-right whitespace-nowrap ${g.pnl !== null ? pnlColor(g.pnl) : 'text-fg-subtle'}`}>
                {g.pnl !== null ? `${g.pnl >= 0 ? '+' : ''}${formatMoney(g.pnl, currency)}` : '—'}
              </span>
            </button>
            {open && (
              <div id={panelId} className="px-3 pb-2 overflow-x-auto">
                <table className="w-full text-[11px] mono tabular-nums">
                  <caption className="sr-only">Lotes comprados en {g.label}</caption>
                  <thead>
                    <tr className="text-fg-subtle font-sans text-[10px] uppercase tracking-wider">
                      <th scope="col" className="text-left font-medium py-1 pr-2">Fecha</th>
                      <th scope="col" className="text-left font-medium py-1 pr-2">Wallet y origen</th>
                      <th scope="col" className="text-right font-medium py-1 pr-2">Cantidad</th>
                      <th scope="col" className="text-right font-medium py-1 pr-2">Precio</th>
                      <th scope="col" className="text-right font-medium py-1 pr-2">Coste</th>
                      <th scope="col" className="text-right font-medium py-1">Resultado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.lots.map(l => {
                      const sale = l.lotIds.some(id => saldrian.has(id))
                      return (
                        <tr key={l.lotId} data-lot-id={l.lotId} data-saldria={sale || undefined}
                          className={`border-t border-border align-top ${sale ? 'bg-warning/8' : l.next ? 'bg-brand/5' : ''}`}>
                          <td className="py-1.5 pr-2 font-sans whitespace-nowrap">
                            <time dateTime={l.openedAt}>
                              <TextTooltip label="Fecha de compra" tip={lotDateDetail(l.openedAt, l.ageDays)}>
                                <span className="text-fg">{formatLotDate(l.openedAt)}</span>
                              </TextTooltip>
                            </time>
                            <span className="block text-fg-subtle">{formatAge(l.ageDays)}</span>
                            {l.next && <span className="text-[10px] font-semibold text-brand-ink">
                              <TextTooltip label="Siguiente lote" tip="Es el primero que se vendería, desde cualquier wallet (FIFO global)">Siguiente</TextTooltip>
                            </span>}
                            {sale && <span className="text-[10px] font-semibold text-warning-ink ml-1">Saldría</span>}
                          </td>
                          <td className="py-1.5 pr-2 font-sans">
                            <span className="block" style={{ color: ink(l.walletColor) }}>{l.walletName}</span>
                            <span className="block text-fg-subtle"><Origen lot={l} /></span>
                          </td>
                          <td className="py-1.5 pr-2 text-right whitespace-nowrap">
                            {formatAmount(l.quantity)}
                            {l.partial && <span className="block text-fg-subtle">
                              <TextTooltip label="Lote parcial" tip="Ya se vendió una parte del lote">de {formatAmount(l.quantityOriginal)}</TextTooltip>
                            </span>}
                          </td>
                          <td className="py-1.5 pr-2 text-right whitespace-nowrap text-fg-muted">{formatPrice(l.unitCost, currency)}</td>
                          <td className="py-1.5 pr-2 text-right whitespace-nowrap text-fg-muted">{formatMoney(l.cost, currency)}</td>
                          <td className="py-1.5 text-right whitespace-nowrap">
                            {l.pnl !== null
                              ? <span className={pnlColor(l.pnl)}>{l.pnl >= 0 ? '+' : ''}{formatMoney(l.pnl, currency)}</span>
                              : <span className="text-fg-subtle">—</span>}
                            {l.pnlPct !== null && <span className="block"><PnlPill pct={l.pnlPct} /></span>}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </li>
        )
      })}
    </ul>
  )
}
