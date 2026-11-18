import { useState, type CSSProperties } from 'react'
import { Award, TrendingDown } from 'lucide-react'
import { extremosAnio, type TotalMesAnio, type TotalTramo } from '../../../utils/calendarioDietz'
import { heatVars } from '../../../utils/topMovers'
import { compareYm, type YearMonth } from '../../../utils/pnlCalendar'
import type { Currency } from '../../../utils/format'
import { CalendarLegend } from './CalendarLegend'
import { signedMoney, signedPct } from './format'

// Vista anual (#216, rehecha en #512): cabecera con el total del año y su %
// por Dietz modificado; 12 teselas opacas con el importe, el % Dietz del mes y
// una mini tira de barras de sus días; el mejor y el peor mes señalados con
// icono y texto; el mes en curso, en vivo. Al pulsar un mes se abre en la
// vista mensual.

const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
const inkOf = (n: number) => (n > 0 ? 'text-positive-ink' : n < 0 ? 'text-negative-ink' : 'text-fg-muted')

/** Mini tira de barras de los días del mes, decorativa (las cifras van en el nombre accesible). */
function MiniBarras({ diarios }: { diarios: ReadonlyArray<number | null> }) {
  const max = diarios.reduce<number>((m, v) => Math.max(m, Math.abs(v ?? 0)), 0)
  const w = 2
  const gap = 1
  const h = 22
  const mid = h / 2
  return (
    <svg aria-hidden="true" width="100%" height={h} viewBox={`0 0 ${diarios.length * (w + gap)} ${h}`} preserveAspectRatio="none" className="block">
      <line x1={0} x2={diarios.length * (w + gap)} y1={mid} y2={mid} className="stroke-border" strokeWidth={0.5} />
      {diarios.map((v, i) => {
        if (v === null || v === 0 || max === 0) return null
        const alto = Math.max(1, (Math.abs(v) / max) * (mid - 1))
        return <rect key={i} x={i * (w + gap)} width={w} y={v > 0 ? mid - alto : mid} height={alto} rx={0.5}
          className={v > 0 ? 'fill-positive' : 'fill-negative'} opacity={0.85} />
      })}
    </svg>
  )
}

export function CalendarYearView({ year, months, total, current, currency, onOpen }: {
  year: number
  months: Array<TotalMesAnio | null>
  /** Total del año (P&L y Dietz); null sin datos. */
  total: TotalTramo | null
  current: YearMonth
  currency: Currency
  onOpen: (ym: YearMonth) => void
}) {
  const [enfocado, setEnfocado] = useState<number | null>(null)
  const maxAbs = months.reduce((m, t) => Math.max(m, Math.abs(t?.pnl ?? 0)), 0)
  const { mejor, peor } = extremosAnio(months)
  return (
    <div className="animate-page-in">
      {total && (
        <p className="mb-3 flex items-baseline gap-2 flex-wrap" data-testid="total-anio">
          <span className="text-[10.5px] uppercase tracking-widest text-fg-subtle">Total de {year}{total.enCurso ? ', con hoy en vivo' : ''}</span>
          <span className={`text-lg mono font-bold tabular-nums ${inkOf(total.pnl)}`}>{signedMoney(total.pnl, currency)}</span>
          <span className={`text-xs mono font-semibold ${inkOf(total.pct)}`}>{signedPct(total.pct)}</span>
        </p>
      )}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
        {MONTHS.map((name, i) => {
          const ym = { year, month: i + 1 }
          const t = months[i]
          const future = compareYm(ym, current) > 0
          const isCurrent = compareYm(ym, current) === 0
          const marca = i === mejor ? 'Mejor mes' : i === peor ? 'Peor mes' : null
          const Icono = i === mejor ? Award : TrendingDown
          return (
            <button key={name} type="button" disabled={future} onClick={() => onOpen(ym)}
              onMouseEnter={() => setEnfocado(i)} onMouseLeave={() => setEnfocado(null)}
              onFocus={() => setEnfocado(i)} onBlur={() => setEnfocado(null)}
              aria-label={`${name} de ${year}${t ? `: ${signedMoney(t.pnl, currency)}, ${signedPct(t.pct)}${marca ? `, ${marca.toLowerCase()}` : ''}${t.enCurso ? ', en curso' : ''}` : future ? ': mes futuro' : ': sin datos'}`}
              style={t ? heatVars(t.pnl, maxAbs) as CSSProperties : undefined}
              className={`relative min-h-24 rounded-xl text-left p-3 transition-[transform,box-shadow] duration-150 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand
                disabled:opacity-40 disabled:cursor-not-allowed enabled:hover:-translate-y-0.5 motion-reduce:transition-none
                ${t ? 'tesela enabled:hover:shadow-[0_10px_22px_-14px_var(--card)]' : 'border border-border/50 bg-overlay/3'} ${isCurrent ? 'ring-1 ring-brand/60' : ''}`}>
              <span aria-hidden="true" className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate text-[11px] uppercase tracking-widest text-fg">{name}</span>
                {marca ? (
                  <span className={`inline-flex items-center gap-1 whitespace-nowrap text-[10px] font-semibold ${i === mejor ? 'text-positive-ink' : 'text-negative-ink'}`}>
                    <Icono size={11} /><span className="sm:hidden">{i === mejor ? 'Mejor' : 'Peor'}</span><span className="hidden sm:inline">{marca}</span>
                  </span>
                ) : t?.enCurso ? <span className="whitespace-nowrap text-[10px] font-semibold text-brand-ink">en curso</span> : null}
              </span>
              {t ? (
                <span aria-hidden="true" className="block mt-1">
                  <span className="flex items-baseline justify-between gap-2 flex-wrap">
                    <span className={`text-[15px] mono font-bold tabular-nums ${inkOf(t.pnl)}`}>{signedMoney(t.pnl, currency)}</span>
                    <span className={`text-[11px] mono font-semibold ${inkOf(t.pct)}`}>{signedPct(t.pct)}</span>
                  </span>
                  <span className="block mt-1.5"><MiniBarras diarios={t.diarios} /></span>
                </span>
              ) : <span className="block mt-1.5 text-xs mono text-fg-subtle" aria-hidden="true">—</span>}
            </button>
          )
        })}
      </div>
      <CalendarLegend maxAbs={maxAbs} currency={currency} unidad="mes" marcador={enfocado !== null ? months[enfocado]?.pnl ?? null : null} />
    </div>
  )
}
