import type { CSSProperties } from 'react'
import { X } from 'lucide-react'
import { useCurrencyQuery } from '../../../hooks/useCurrencyQuery'
import { dayDetailQuery } from '../../../queries/currencyQueries'
import { formatMoney, type Currency } from '../../../utils/format'
import type { CalendarDay } from '../../../utils/pnlCalendar'
import { iconButtonClasses } from '../../../components/ui'
import { CryptoIcon } from '../../../components/CryptoIcon'
import { longDate, signedMoney, signedPct, toneOf } from './format'

// Detalle del día elegido (#216), bajo la cuadrícula: P&L, %, valor al cierre,
// flujos de capital y los activos que más aportaron o restaron (efecto precio),
// con el resto en «Operaciones del día y otros». Marco con el color del signo
// del día, como las celdas (#412).

const TOP = 3
// Por debajo de esto, la diferencia es redondeo de céntimos, no operaciones del día.
const OTHER_MIN = 0.05

function ContributionList({ title, items, currency }: { title: string; items: Array<{ asset: string; pnl: number }>; currency: Currency }) {
  return (
    <div className="min-w-0">
      <h4 className="text-[11px] uppercase tracking-wider text-fg-subtle mb-1.5">{title}</h4>
      {items.length === 0
        ? <p className="text-xs text-fg-subtle">—</p>
        : (
          <ul className="space-y-1">
            {items.map(c => (
              <li key={c.asset} className="flex items-center justify-between gap-3 text-xs">
                <span className="flex items-center gap-1.5 min-w-0">
                  {c.asset === 'EUR'
                    ? <span className="mono text-fg">EUR <span className="text-fg-subtle">(divisa)</span></span>
                    : <><CryptoIcon symbol={c.asset} size={16} /><span className="mono text-fg truncate">{c.asset}</span></>}
                </span>
                <span className={`mono ${toneOf(c.pnl)}`}>{signedMoney(c.pnl, currency)}</span>
              </li>
            ))}
          </ul>
        )}
    </div>
  )
}

export function CalendarDayDetail({ date, day, onClose }: { date: string; day: CalendarDay | undefined; onClose: () => void }) {
  const { data, isLoading, isError, currency: requested } = useCurrencyQuery(
    c => dayDetailQuery(c, date),
    { refetchInterval: day?.live ? 60_000 : false },
  )
  const currency = data?.currency ?? requested
  // Hoy, la cifra principal es la del calendario (en vivo); el reparto, la del servidor.
  const pnl = day?.pnl ?? data?.pnl ?? 0
  const pct = day?.pct ?? data?.pct ?? null
  const gains = (data?.contributions ?? []).filter(c => c.pnl > 0).slice(0, TOP)
  const losses = (data?.contributions ?? []).filter(c => c.pnl < 0).reverse().slice(0, TOP)

  return (
    <section aria-label={`Detalle del ${longDate(date)}`} aria-live="polite"
      onKeyDown={e => { if (e.key === 'Escape') onClose() }}
      style={{ '--card': pnl > 0 ? 'var(--cf-positive)' : pnl < 0 ? 'var(--cf-negative)' : 'var(--cf-fg-subtle)', '--heat': '0.3' } as CSSProperties}
      className="heat-frame mt-3 rounded-2xl p-px animate-page-in">
      <div className="heat-body rounded-[15px] p-4">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <h4 className="text-sm font-semibold text-fg first-letter:uppercase">{longDate(date)}{day?.live ? ' · en vivo' : ''}</h4>
          <p className={`text-lg mono font-semibold ${toneOf(pnl)}`}>
            {signedMoney(pnl, currency)} <span className="text-sm font-normal opacity-80">{pct === null ? '' : `(${signedPct(pct)})`}</span>
          </p>
        </div>
        <button type="button" onClick={onClose} aria-label="Cerrar el detalle del día" className={iconButtonClasses('sm')}>
          <X size={14} />
        </button>
      </div>

      {isLoading && <p className="text-xs text-fg-subtle">Cargando el detalle…</p>}
      {isError && <p className="text-xs text-fg-subtle">No se pudo cargar el detalle del día.</p>}
      {data && (
        <div className="grid gap-4 sm:grid-cols-3">
          <dl className="space-y-1 text-xs">
            <div className="flex justify-between gap-3"><dt className="text-fg-subtle">Valor al cierre</dt><dd className="mono text-fg">{formatMoney(data.value, currency)}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-fg-subtle">Entradas de capital</dt><dd className="mono text-positive">{data.inflow > 0 ? `+${formatMoney(data.inflow, currency)}` : '—'}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-fg-subtle">Salidas de capital</dt><dd className="mono text-negative">{data.outflow > 0 ? `−${formatMoney(data.outflow, currency)}` : '—'}</dd></div>
            {Math.abs(data.other) >= OTHER_MIN && (
              <div className="flex justify-between gap-3 pt-1 border-t border-border/60">
                <dt className="text-fg-subtle">Operaciones del día y otros</dt><dd className={`mono ${toneOf(data.other)}`}>{signedMoney(data.other, currency)}</dd>
              </div>
            )}
          </dl>
          <ContributionList title="Más aportaron" items={gains} currency={currency} />
          <ContributionList title="Más restaron" items={losses} currency={currency} />
        </div>
      )}
      </div>
    </section>
  )
}
