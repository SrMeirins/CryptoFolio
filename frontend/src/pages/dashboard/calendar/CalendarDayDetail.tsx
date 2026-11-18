import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { useCurrencyQuery } from '../../../hooks/useCurrencyQuery'
import { dayDetailQuery } from '../../../queries/currencyQueries'
import { formatMoney, type Currency } from '../../../utils/format'
import type { CalendarDay } from '../../../utils/pnlCalendar'
import { barrasActivos, ordinal, puestoDelDia } from '../../../utils/calendarioDia'
import { iconButtonClasses, Skeleton, SkeletonGroup, QueryError } from '../../../components/ui'
import { CryptoIcon } from '../../../components/CryptoIcon'
import { longDate, signedMoney, signedPct, toneOf } from './format'

// Detalle del día elegido (#216), opaco desde #512: P&L y %, puesto del día
// entre los del mes con una mini regla del peor al mejor, valor al cierre,
// flujos de capital y el reparto por activos en barras divergentes (ganancias
// a la derecha, pérdidas a la izquierda), cada uno con enlace a Portfolio.
// Botones para ir al día anterior y al siguiente con dato.

const VISIBLES = 8
// Por debajo de esto, la diferencia es redondeo de céntimos, no operaciones del día.
const OTHER_MIN = 0.05

function BarrasPorActivo({ items, currency }: { items: ReturnType<typeof barrasActivos>; currency: Currency }) {
  const [todos, setTodos] = useState(false)
  const visibles = todos ? items : items.slice(0, VISIBLES)
  if (items.length === 0) return <p className="text-xs text-fg-subtle">Sin movimiento por precio este día.</p>
  return (
    <div>
      <ul className="space-y-1 max-w-2xl">
        {visibles.map(c => (
          <li key={c.asset}>
            <Link to={c.asset === 'EUR' ? '/portfolio' : `/portfolio?activo=${encodeURIComponent(c.asset)}`}
              aria-label={`${c.asset}: ${signedMoney(c.pnl, currency)}. Ver ${c.asset} en Portfolio`}
              className="grid grid-cols-[5.5rem_1fr_1fr_6.5rem] items-center gap-2 rounded-md px-1.5 py-1 text-xs hover:bg-overlay/5 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand">
              <span className="flex items-center gap-1.5 min-w-0">
                {c.asset === 'EUR' ? <span className="mono text-fg">EUR</span> : <><CryptoIcon symbol={c.asset} size={16} /><span className="mono text-fg truncate">{c.asset}</span></>}
              </span>
              {/* Pérdidas crecen hacia la izquierda desde el eje central; ganancias, hacia la derecha. */}
              <span aria-hidden="true" className="flex justify-end h-2.5">
                {c.pnl < 0 && <span className="h-full rounded-l-sm bg-negative/80" style={{ width: `${Math.max(3, c.fraccion * 100)}%` }} />}
              </span>
              <span aria-hidden="true" className="flex h-2.5 border-l border-border">
                {c.pnl > 0 && <span className="h-full rounded-r-sm bg-positive/80" style={{ width: `${Math.max(3, c.fraccion * 100)}%` }} />}
              </span>
              <span aria-hidden="true" className={`mono text-right ${toneOf(c.pnl)}`}>{signedMoney(c.pnl, currency)}</span>
            </Link>
          </li>
        ))}
      </ul>
      {items.length > VISIBLES && (
        <button type="button" onClick={() => setTodos(t => !t)} aria-expanded={todos}
          className="mt-1.5 text-xs text-brand-ink hover:underline focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand rounded">
          {todos ? 'Ver menos' : `Ver los ${items.length} activos`}
        </button>
      )}
    </div>
  )
}

export function CalendarDayDetail({ date, day, dias = [], onClose, onPrev, onNext }: {
  date: string
  day: CalendarDay | undefined
  /** Días del mes, para el puesto del día. */
  dias?: readonly CalendarDay[]
  onClose: () => void
  /** Días con dato anterior y siguiente; sin ellos, el botón se desactiva. */
  onPrev?: (() => void) | null
  onNext?: (() => void) | null
}) {
  const dayQ = useCurrencyQuery(
    c => dayDetailQuery(c, date),
    { refetchInterval: day?.live ? 60_000 : false },
  )
  const { data, isLoading, isError, currency: requested } = dayQ
  const currency = data?.currency ?? requested
  // Hoy, la cifra principal es la del calendario (en vivo); el reparto, la del servidor.
  const pnl = day?.pnl ?? data?.pnl ?? 0
  const pct = day?.pct ?? data?.pct ?? null
  const puesto = puestoDelDia(dias, date)
  const activos = barrasActivos(data?.contributions ?? [])
  const acento = pnl > 0 ? 'border-l-positive' : pnl < 0 ? 'border-l-negative' : 'border-l-border'
  const nav = iconButtonClasses('sm', false, 'disabled:hover:bg-transparent')

  return (
    <section aria-label={`Detalle del ${longDate(date)}`} aria-live="polite"
      onKeyDown={e => { if (e.key === 'Escape') onClose() }}
      className={`mt-3 rounded-2xl border border-border border-l-4 ${acento} bg-background-card shadow-lg p-4 animate-page-in`}>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <h4 className="text-sm font-semibold text-fg first-letter:uppercase">{longDate(date)}{day?.live ? ', en vivo' : ''}</h4>
          <p className={`text-xl mono font-bold tabular-nums ${toneOf(pnl)}`}>
            {signedMoney(pnl, currency)} <span className="text-sm font-semibold">{pct === null ? '' : signedPct(pct)}</span>
          </p>
          {puesto && (
            <div className="mt-1 flex items-center gap-2 text-[11px] text-fg-muted">
              <span>{ordinal(puesto.puesto)} {puesto.sentido} día de {puesto.de} cerrados del mes</span>
              <span aria-hidden="true" className="relative block w-20 h-1.5 rounded-full bg-gradient-to-r from-negative/60 via-overlay/10 to-positive/60">
                <span className="absolute -top-1 -bottom-1 w-1 -ml-0.5 rounded-full bg-fg" style={{ left: `${puesto.posicion * 100}%` }} />
              </span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          <button type="button" onClick={() => onPrev?.()} disabled={!onPrev} aria-label="Día anterior" className={nav}><ChevronLeft size={14} /></button>
          <button type="button" onClick={() => onNext?.()} disabled={!onNext} aria-label="Día siguiente" className={nav}><ChevronRight size={14} /></button>
          <button type="button" onClick={onClose} aria-label="Cerrar el detalle del día" className={iconButtonClasses('sm')}><X size={14} /></button>
        </div>
      </div>

      {isLoading && (
        <SkeletonGroup label="Cargando el detalle del día" className="grid gap-4 sm:grid-cols-[14rem_1fr]">
          {[0, 1].map(i => <div key={i} className="space-y-1.5"><Skeleton className="h-3 w-full" /><Skeleton className="h-3 w-4/5" /><Skeleton className="h-3 w-3/5" /></div>)}
        </SkeletonGroup>
      )}
      {isError && <QueryError what="el detalle del día" error={dayQ.error} onRetry={() => void dayQ.refetch()} />}
      {data && (
        <div className="grid gap-4 sm:grid-cols-[14rem_1fr]">
          <dl className="space-y-1 text-xs">
            <div className="flex justify-between gap-3"><dt className="text-fg-subtle">Valor al cierre</dt><dd className="mono text-fg">{formatMoney(data.value, currency)}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-fg-subtle">Entradas de capital</dt><dd className="mono text-positive-ink">{data.inflow > 0 ? `+${formatMoney(data.inflow, currency)}` : '—'}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-fg-subtle">Salidas de capital</dt><dd className="mono text-negative-ink">{data.outflow > 0 ? `−${formatMoney(data.outflow, currency)}` : '—'}</dd></div>
            {Math.abs(data.other) >= OTHER_MIN && (
              <div className="flex justify-between gap-3 pt-1 border-t border-border/60">
                <dt className="text-fg-subtle">Operaciones del día y otros</dt><dd className={`mono ${toneOf(data.other)}`}>{signedMoney(data.other, currency)}</dd>
              </div>
            )}
          </dl>
          <div className="min-w-0">
            <h5 className="text-[11px] uppercase tracking-wider text-fg-subtle mb-1.5">Por activo, efecto precio</h5>
            <BarrasPorActivo key={date} items={activos} currency={currency} />
          </div>
        </div>
      )}
    </section>
  )
}
