import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import type { SimulationResult } from '../../api/portfolio'
import { formatAmount, formatEur, formatPercent, formatPrice } from '../../utils/format'
import { formatLotDate } from '../../utils/portfolioLots'
import { tramosLotes, type TramoLote } from '../../utils/simuladorResumen'

// «Qué vendes» del simulador (#529): la cantidad y la línea temporal de los
// lotes que salen en orden FIFO. Cada fila lleva la fecha y el precio de
// compra, una barra que es el propio lote (llena si sale entero; si no, la
// parte que sale, con «Parte: X de Y») y chips con el peso en la venta, el
// coste y el resultado; el resultado lleva signo y texto, no solo color. Con
// muchos lotes se ven los primeros y el resto se despliega.

export const LOTES_VISIBLES = 5

function Chip({ children, tono = 'neutro', label, despues = false }: { children: React.ReactNode; tono?: 'neutro' | 'positivo' | 'negativo'; label: string; despues?: boolean }) {
  const cls = tono === 'positivo' ? 'border-positive/30 bg-positive/10 text-positive-ink'
    : tono === 'negativo' ? 'border-negative/30 bg-negative/10 text-negative-ink'
    : 'border-border bg-overlay/4 text-fg-muted'
  return (
    <span className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] mono tabular-nums whitespace-nowrap ${cls}`}>
      {!despues && <span className="font-sans text-[10px]">{label}</span>}{children}
      {despues && <span className="font-sans text-[10px]">{label}</span>}
    </span>
  )
}

function FilaLote({ t, asset, indice }: { t: TramoLote; asset: string; indice: number }) {
  const gana = t.gainLossEur > 0.005
  const pierde = t.gainLossEur < -0.005
  return (
    <li className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-x-3 gap-y-1 py-2 border-t border-border first:border-t-0" data-testid="tramo-lote">
      <div className="min-w-0">
        <p className="text-xs text-fg"><span className="sr-only">Lote {indice}, comprado el </span>{formatLotDate(t.openedAt)}</p>
        <p className="text-[10px] text-fg-subtle mono">a {formatPrice(t.unitCost)}</p>
      </div>
      <div className="min-w-0 space-y-1.5">
        <div className="flex items-center gap-2">
          <span className="relative h-2 flex-1 rounded-full bg-overlay/8 overflow-hidden" aria-hidden="true">
            <span className="absolute inset-y-0 left-0 rounded-full bg-brand/70" style={{ width: `${Math.max(t.fraccionLote, 3)}%` }} />
          </span>
          <span className="mono tabular-nums text-xs text-fg whitespace-nowrap">{formatAmount(t.quantity)} {asset}</span>
          <span className="text-[11px] text-fg-muted whitespace-nowrap shrink-0">
            {t.partial ? <>Parte: <span className="mono">{formatAmount(t.quantity)} de {formatAmount(t.available)}</span></> : 'Lote entero'}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Chip label="de la venta" despues>{formatPercent(t.share, t.share < 10 ? 1 : 0)}</Chip>
          <Chip label="coste">{formatEur(t.costEur)}</Chip>
          <Chip label={gana ? 'gana' : pierde ? 'pierde' : 'resultado'} tono={gana ? 'positivo' : pierde ? 'negativo' : 'neutro'}>
            {t.gainLossEur > 0.005 ? '+' : ''}{formatEur(t.gainLossEur)}
          </Chip>
        </div>
      </div>
    </li>
  )
}

export function QueVendes({ result, walletName }: { result: SimulationResult; walletName: string }) {
  const [todos, setTodos] = useState(false)
  const tramos = tramosLotes(result)
  const visibles = todos ? tramos : tramos.slice(0, LOTES_VISIBLES)
  const restantes = tramos.length - LOTES_VISIBLES
  return (
    <section aria-labelledby="sim-que-vendes" className="rounded-xl border border-border p-4 space-y-3">
      <h3 id="sim-que-vendes" className="text-[11px] font-semibold uppercase tracking-widest text-fg-subtle">Qué vendes</h3>
      <p className="text-sm text-fg">
        <span className="mono font-semibold">{formatAmount(result.quantity)} {result.asset}</span>
        <span className="text-fg-muted"> de {walletName}, a </span>
        <span className="mono">{formatPrice(result.priceEur)}</span>
        <span className="text-fg-muted"> por unidad</span>
      </p>

      {tramos.length > 0 && (
        <div>
          <p className="text-[11px] text-fg-subtle">
            Salen {tramos.length} {tramos.length === 1 ? 'lote' : 'lotes'}, del más antiguo al más reciente (FIFO global).
            La barra es cada lote: llena si se vende entero; si no, la parte que sale.
          </p>
          <ol aria-label="Lotes que salen, en orden FIFO" className="mt-1">
            {visibles.map((t, i) => <FilaLote key={t.lotId} t={t} asset={result.asset} indice={i + 1} />)}
          </ol>
          {restantes > 0 && (
            <button type="button" onClick={() => setTodos(v => !v)} aria-expanded={todos}
              className="mt-1 flex items-center gap-1.5 text-xs text-fg-subtle hover:text-fg transition-colors rounded focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-brand">
              <ChevronDown size={13} aria-hidden="true" className={`transition-transform ${todos ? 'rotate-180' : ''}`} />
              {todos ? `Ver solo los ${LOTES_VISIBLES} primeros` : `Ver los ${restantes} restantes`}
            </button>
          )}
        </div>
      )}

      <dl className="flex items-baseline justify-between gap-3 border-t border-border pt-2.5">
        <dt className="text-xs text-fg-muted">Coste FIFO de lo vendido</dt>
        <dd className="mono tabular-nums text-sm font-semibold text-fg">{formatEur(result.totalCostBasis)}</dd>
      </dl>
    </section>
  )
}
