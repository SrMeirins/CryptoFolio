import { useMemo, useState } from 'react'
import { BarChart2, ChevronDown, ChevronUp } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { STATS_CATEGORIES, type HistoryStats } from '../../api/portfolio'
import { CryptoIcon } from '../../components/CryptoIcon'
import { formatMoney, formatAmount, formatNumber, type Currency } from '../../utils/format'
import { useChartColors } from '../../hooks/useChartColors'
import { cardClasses } from '../../components/ui'
import { CATEGORY_LABELS, chartPeriodText, chartRows, type ChartMode, type ChartRow } from './stats/statsChart'
import { readAnalyticsOpen, readChartMode, saveAnalyticsOpen, saveChartMode } from './stats/analyticsPrefs'

// Analítica de actividad del Historial sobre lo filtrado (#376): gráfico por
// mes o año en número de operaciones o en valor, top activos y comisiones por
// activo. Los conmutadores trabajan con los datos ya cargados.

function ChartTooltip({ active, payload, label, format }: {
  active?: boolean; payload?: { value: number; name?: string }[]; label?: string; format: (v: number) => string
}) {
  if (!active || !payload?.length) return null
  return (
    <div className={cardClasses('none', 'px-3 py-2 text-xs shadow-lg')}>
      <p className="text-fg-muted mb-1 font-medium">{label}</p>
      {payload.filter(p => p.value).map((p, i) => (
        <p key={i} className="text-fg mono">{p.name}: <span className="font-bold">{format(p.value)}</span></p>
      ))}
    </div>
  )
}

/** Alternativa en texto del gráfico (#351): el SVG no es accesible. Sigue al modo activo. */
function ChartTable({ rows, caption, format }: { rows: ChartRow[]; caption: string; format: (v: number) => string }) {
  return (
    <table className="sr-only">
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
  )
}

function ModeToggle({ mode, onChange }: { mode: ChartMode; onChange: (m: ChartMode) => void }) {
  const options: [ChartMode, string][] = [['ops', 'Número'], ['valor', 'Valor']]
  return (
    <div role="group" aria-label="Medida del gráfico" className="inline-flex rounded-lg border border-border p-0.5">
      {options.map(([m, label]) => (
        <button key={m} type="button" aria-pressed={mode === m} onClick={() => onChange(m)}
          className={`px-2.5 py-1 text-xs rounded-md transition-colors focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand ${
            mode === m ? 'bg-brand/15 text-brand-ink font-semibold' : 'text-fg-muted hover:text-fg'}`}>
          {label}
        </button>
      ))}
    </div>
  )
}

export function AnalyticsPanel({ stats, currency, datesFiltered, onAssetClick }: {
  stats: HistoryStats
  currency: Currency
  /** Hay filtro de fechas: el gráfico y los rankings cubren ese rango. */
  datesFiltered: boolean
  onAssetClick: (asset: string) => void
}) {
  const c = useChartColors()
  const [open, setOpen] = useState(readAnalyticsOpen)
  const [mode, setMode] = useState<ChartMode>(readChartMode)
  const rows = useMemo(() => chartRows(stats.chart, mode, currency), [stats.chart, mode, currency])
  const maxTotal = Math.max(...rows.map(r => r.total), 1)
  const format = (v: number) => (mode === 'ops' ? formatNumber(v, 0) : formatMoney(v, currency))
  const period = chartPeriodText(stats.chart, datesFiltered)
  const rankings = stats.rankings_periodo === 'ultimo_anio' ? 'último año' : 'periodo filtrado'
  const colors: Record<string, [string, number]> = {
    compras: [c.gain, 1], ventas: [c.loss, 1], otras_salidas: [c.loss, 0.45],
    ingresos: [c.warn, 1], transferencias: [c.neutral, 1], otros: [c.neutralSoft, 1],
  }

  function toggleOpen() {
    setOpen(o => { saveAnalyticsOpen(!o); return !o })
  }
  function changeMode(m: ChartMode) {
    setMode(m)
    saveChartMode(m)
  }

  return (
    <div className={cardClasses('none', 'overflow-hidden')}>
      <button
        type="button"
        onClick={toggleOpen}
        aria-expanded={open}
        aria-controls={open ? 'historial-analitica' : undefined}
        className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-overlay/2 transition-colors focus:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand"
      >
        <div className="flex items-center gap-2">
          <BarChart2 size={14} aria-hidden="true" className="text-fg-subtle" />
          <span className="text-sm font-medium">Analítica de actividad</span>
          <span className="text-xs text-fg-subtle">{period} · top activos · comisiones</span>
        </div>
        {open ? <ChevronUp size={14} aria-hidden="true" className="text-fg-subtle" /> : <ChevronDown size={14} aria-hidden="true" className="text-fg-subtle" />}
      </button>

      {open && (
        <div id="historial-analitica" className="border-t border-border p-5 space-y-5">
          <div>
            <div className="flex items-center justify-between gap-3 mb-3">
              <p className="text-[11px] text-fg-subtle uppercase tracking-widest">
                {mode === 'ops' ? 'Operaciones' : `Valor en ${currency}`} {stats.chart.granularity === 'year' ? 'por año' : 'por mes'}
              </p>
              <ModeToggle mode={mode} onChange={changeMode} />
            </div>
            <ChartTable rows={rows} format={format}
              caption={`${mode === 'ops' ? 'Operaciones' : `Valor en ${currency}`} por ${stats.chart.granularity === 'year' ? 'año' : 'mes'} y categoría`} />
            <div aria-hidden="true">
              <ResponsiveContainer width="100%" height={130}>
                <BarChart data={rows} margin={{ top: 0, right: 0, left: 0, bottom: 0 }} barSize={10} barGap={1}>
                  <XAxis dataKey="label" tick={{ fontSize: 12, fill: c.axisMuted }} axisLine={false} tickLine={false} />
                  <YAxis hide domain={[0, maxTotal * 1.2]} />
                  <Tooltip content={<ChartTooltip format={format} />} cursor={{ fill: c.cursorSoft }} />
                  {STATS_CATEGORIES.map((cat, i) => (
                    <Bar key={cat} dataKey={cat} name={CATEGORY_LABELS[cat]} stackId="a" fill={colors[cat][0]} fillOpacity={colors[cat][1]}
                      radius={i === STATS_CATEGORIES.length - 1 ? [2, 2, 0, 0] : undefined} isAnimationActive={false} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div aria-hidden="true" className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2">
              {STATS_CATEGORIES.map(cat => (
                <div key={cat} className="flex items-center gap-1.5 text-xs text-fg-subtle">
                  <div className="w-2 h-2 rounded-lg" style={{ backgroundColor: colors[cat][0], opacity: colors[cat][1] }} />{CATEGORY_LABELS[cat]}
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-1 border-t border-border/50">
            <div>
              <p className="text-[11px] text-fg-subtle uppercase tracking-widest mb-2">
                Top activos <span className="text-fg-subtle normal-case">· {rankings}</span>
              </p>
              {stats.top_assets.length === 0 && <p className="text-xs text-fg-subtle">Sin compras ni ventas en este periodo.</p>}
              <div className="space-y-1.5">
                {stats.top_assets.slice(0, 6).map((row) => (
                  <button
                    key={row.asset}
                    type="button"
                    onClick={() => onAssetClick(row.asset)}
                    className="w-full flex items-center gap-2 group/asset hover:bg-background-tertiary/50 rounded-lg px-1 py-0.5 transition-colors focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand"
                    title={`Filtrar ${row.asset}`}
                    aria-label={`Filtrar ${row.asset}: ${row.ops} compras y ventas, ${formatMoney(row.volume[currency], currency)}`}
                  >
                    <CryptoIcon symbol={row.asset} size={16} />
                    <span className="text-xs mono font-bold text-fg w-12 shrink-0">{row.asset}</span>
                    <div className="flex-1 h-1.5 bg-background-tertiary rounded-full overflow-hidden">
                      <div className="h-full rounded-full bg-brand/60 group-hover/asset:bg-brand-solid transition-colors"
                        style={{ width: `${(row.ops / (stats.top_assets[0]?.ops || 1)) * 100}%` }} />
                    </div>
                    <span className="text-xs text-fg-subtle w-5 text-right shrink-0">{row.ops}</span>
                  </button>
                ))}
              </div>
              {stats.top_assets.length > 0 && <p className="text-xs text-fg-subtle mt-1.5 pl-1">Pulsa un activo para filtrarlo</p>}
            </div>

            {stats.fees_by_asset.length > 0 && (
              <div>
                <p className="text-[11px] text-fg-subtle uppercase tracking-widest mb-2">
                  Comisiones por activo <span className="text-fg-subtle normal-case">· {rankings}</span>
                </p>
                <div className="space-y-1.5">
                  {stats.fees_by_asset.map((row) => (
                    <div key={row.asset} className="flex items-center gap-2">
                      <CryptoIcon symbol={row.asset} size={16} />
                      <span className="text-xs mono font-bold text-fg w-12 shrink-0">{row.asset}</span>
                      <div className="flex-1 h-1.5 bg-background-tertiary rounded-full overflow-hidden">
                        <div className="h-full rounded-full bg-warning/50"
                          style={{ width: `${(row.value[currency] / (stats.fees_by_asset[0]?.value[currency] || 1)) * 100}%` }} />
                      </div>
                      {row.value[currency] > 0
                        ? <span className="text-xs text-fg-muted mono font-semibold shrink-0">{formatMoney(row.value[currency], currency)}</span>
                        : <span className="text-xs text-fg-subtle mono shrink-0">{formatAmount(row.amount, 4)}</span>
                      }
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
