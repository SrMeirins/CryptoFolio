import { useMemo, useState } from 'react'
import { BarChart, Bar, Cell, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { STATS_CATEGORIES, type HistoryStats, type StatsCategory } from '../../../api/portfolio'
import { formatMoney, formatNumber, type Currency } from '../../../utils/format'
import { useReducedMotion } from '../../../hooks/useReducedMotion'
import { CATEGORY_LABELS, chartRows, periodBreakdown, type ChartMode, type ChartRow } from './statsChart'

// Gráfico de actividad del Historial (#376, #413): barras apiladas por
// categoría con degradado, foco en el periodo bajo el ratón (los demás se
// atenúan), detalle completo del periodo y botones de periodo bajo las barras
// que filtran la lista por sus fechas. El SVG es decorativo: la tabla oculta
// y los botones dan la misma información con teclado y lector de pantalla.

export type CategoryColors = Record<StatsCategory, [string, number]>

const DIM = 0.3

function DetailTooltip({ active, payload, chart, mode, currency, colors }: {
  active?: boolean; payload?: { payload: ChartRow }[]
  chart: HistoryStats['chart']; mode: ChartMode; currency: Currency; colors: CategoryColors
}) {
  const row = payload?.[0]?.payload
  const bucket = row && chart.buckets.find(b => b.periodo === row.periodo)
  if (!active || !row || !bucket) return null
  const d = periodBreakdown(bucket, mode, currency)
  return (
    <div className="glass-tooltip rounded-xl px-3.5 py-3 text-xs min-w-52">
      <p className="font-semibold text-fg capitalize">{row.label}</p>
      <p className="text-fg-subtle mb-2 mono">{formatNumber(d.ops, 0)} {d.ops === 1 ? 'operación' : 'operaciones'} · {formatMoney(d.value, currency)}</p>
      {d.items.length === 0 && <p className="text-fg-subtle">Sin actividad.</p>}
      <ul className="space-y-1">
        {d.items.map((it, i) => (
          <li key={it.category} className={`flex items-center gap-2 ${i === 0 ? 'text-fg font-semibold' : 'text-fg-muted'}`}>
            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: colors[it.category][0], opacity: colors[it.category][1] }} />
            <span className="flex-1">{CATEGORY_LABELS[it.category]}</span>
            <span className="mono">{formatNumber(it.ops, 0)}</span>
            <span className="mono w-20 text-right">{formatMoney(it.value, currency)}</span>
            <span className="mono w-10 text-right text-fg-subtle">{Math.round(it.share * 100)} %</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Alternativa en texto del gráfico (#351), oculta: envuelta para que ningún navegador pinte su leyenda (#413). */
function ChartTable({ rows, caption, format }: { rows: ChartRow[]; caption: string; format: (v: number) => string }) {
  return (
    <div className="sr-only">
      <table>
        <caption>{caption}</caption>
        <thead>
          <tr><th scope="col">Periodo</th>{STATS_CATEGORIES.map(c => <th key={c} scope="col">{CATEGORY_LABELS[c]}</th>)}<th scope="col">Total</th></tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.periodo}>
              <th scope="row">{r.label}</th>
              {STATS_CATEGORIES.map(c => <td key={c}>{format(r[c])}</td>)}
              <td>{format(r.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function ActivityChart({ chart, mode, currency, colors, selected, onSelect }: {
  chart: HistoryStats['chart']
  mode: ChartMode
  currency: Currency
  colors: CategoryColors
  /** Periodo que coincide con el filtro de fechas, si lo hay. */
  selected: string | null
  /** Pulsar un periodo: filtra por sus fechas; el ya elegido, lo quita (null). */
  onSelect: (periodo: string | null) => void
}) {
  const reduceMotion = useReducedMotion()
  const [hover, setHover] = useState<number | null>(null)
  const rows = useMemo(() => chartRows(chart, mode, currency), [chart, mode, currency])
  const maxTotal = Math.max(...rows.map(r => r.total), 1)
  const format = (v: number) => (mode === 'ops' ? formatNumber(v, 0) : formatMoney(v, currency))
  const unit = chart.granularity === 'year' ? 'año' : 'mes'
  const selectedIndex = rows.findIndex(r => r.periodo === selected)
  // Con el ratón encima manda el foco; si no, el periodo filtrado.
  const focus = hover ?? (selectedIndex >= 0 ? selectedIndex : null)
  const pick = (i: number) => onSelect(rows[i].periodo === selected ? null : rows[i].periodo)

  return (
    <div>
      <ChartTable rows={rows} format={format}
        caption={`${mode === 'ops' ? 'Operaciones' : `Valor en ${currency}`} por ${unit} y categoría`} />
      <div aria-hidden="true">
        <ResponsiveContainer width="100%" height={150}>
          <BarChart data={rows} margin={{ top: 4, right: 0, left: 0, bottom: 0 }} barCategoryGap="22%"
            onMouseMove={s => setHover(s?.activeTooltipIndex == null ? null : Number(s.activeTooltipIndex))}
            onMouseLeave={() => setHover(null)}
            onClick={s => { if (s?.activeTooltipIndex != null) pick(Number(s.activeTooltipIndex)) }}
            style={{ cursor: 'pointer' }}>
            <defs>
              {STATS_CATEGORIES.map(cat => (
                <linearGradient key={cat} id={`actividad-${cat}`} x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor={colors[cat][0]} stopOpacity={colors[cat][1]} />
                  <stop offset="100%" stopColor={colors[cat][0]} stopOpacity={colors[cat][1] * 0.55} />
                </linearGradient>
              ))}
            </defs>
            <YAxis hide domain={[0, maxTotal * 1.15]} />
            <Tooltip content={<DetailTooltip chart={chart} mode={mode} currency={currency} colors={colors} />}
              cursor={false} isAnimationActive={false} />
            {STATS_CATEGORIES.map(cat => (
              <Bar key={cat} dataKey={cat} name={CATEGORY_LABELS[cat]} stackId="a" fill={`url(#actividad-${cat})`}
                radius={[3, 3, 0, 0]} maxBarSize={34} isAnimationActive={!reduceMotion} animationDuration={500}>
                {rows.map((r, i) => (
                  <Cell key={r.periodo} fillOpacity={focus === null || focus === i ? 1 : DIM} style={{ transition: 'fill-opacity 0.15s ease-out' }} />
                ))}
              </Bar>
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
      {/* Un botón por periodo, alineado con su barra: filtra la lista por sus fechas. */}
      <div className="grid mt-1" style={{ gridTemplateColumns: `repeat(${rows.length}, minmax(0, 1fr))` }}>
        {rows.map((r, i) => (
          <button key={r.periodo} type="button" onClick={() => pick(i)} aria-pressed={r.periodo === selected}
            onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}
            onFocus={() => setHover(i)} onBlur={() => setHover(null)}
            aria-label={`${r.periodo === selected ? 'Quitar el filtro de' : 'Filtrar'} ${r.label}: ${format(r.total)}`}
            className={`truncate rounded-md py-1 text-[11px] capitalize transition-colors focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand ${
              r.periodo === selected ? 'bg-brand/15 text-brand-ink font-semibold' : 'text-fg-subtle hover:text-fg'}`}>
            {r.label}
          </button>
        ))}
      </div>
    </div>
  )
}
