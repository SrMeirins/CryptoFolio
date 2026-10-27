import { useState } from 'react'
import { BarChart2, ChevronDown, ChevronUp } from 'lucide-react'
import { STATS_CATEGORIES, type HistoryStats } from '../../api/portfolio'
import type { Currency } from '../../utils/format'
import { useChartColors } from '../../hooks/useChartColors'
import { cardClasses } from '../../components/ui'
import { CATEGORY_LABELS, activePeriod, chartPeriodText, periodRange, type ChartMode } from './stats/statsChart'
import { readAnalyticsOpen, readChartMode, saveAnalyticsOpen, saveChartMode } from './stats/analyticsPrefs'
import { ActivityChart, type CategoryColors } from './stats/ActivityChart'
import { Rankings } from './stats/Rankings'

// Analítica de actividad del Historial sobre lo filtrado (#376): gráfico por
// mes o año en número de operaciones o en valor, top activos y comisiones por
// activo. Los conmutadores trabajan con los datos ya cargados. Pulsar un
// periodo filtra la lista por sus fechas (#413).

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

export function AnalyticsPanel({ stats, currency, dateFrom, dateTo, onAssetClick, onDateRange }: {
  stats: HistoryStats
  currency: Currency
  /** Filtro de fechas actual: el gráfico y los rankings cubren ese rango. */
  dateFrom: string
  dateTo: string
  onAssetClick: (asset: string) => void
  onDateRange: (from: string, to: string) => void
}) {
  const c = useChartColors()
  const [open, setOpen] = useState(readAnalyticsOpen)
  const [mode, setMode] = useState<ChartMode>(readChartMode)
  const datesFiltered = !!(dateFrom || dateTo)
  const period = chartPeriodText(stats.chart, datesFiltered)
  const rankings = stats.rankings_periodo === 'ultimo_anio' ? 'último año' : 'periodo filtrado'
  const colors: CategoryColors = {
    compras: [c.gain, 1], ventas: [c.loss, 1], otras_salidas: [c.loss, 0.45],
    ingresos: [c.warn, 1], transferencias: [c.neutral, 1], otros: [c.neutralSoft, 1],
  }
  const selected = activePeriod(stats.chart, dateFrom, dateTo)

  function toggleOpen() {
    setOpen(o => { saveAnalyticsOpen(!o); return !o })
  }
  function changeMode(m: ChartMode) {
    setMode(m)
    saveChartMode(m)
  }
  function selectPeriod(periodo: string | null) {
    if (!periodo) { onDateRange('', ''); return }
    const r = periodRange(periodo, stats.chart.granularity)
    onDateRange(r.from, r.to)
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
                <span className="normal-case tracking-normal"> · pulsa un {stats.chart.granularity === 'year' ? 'año' : 'mes'} para filtrarlo</span>
              </p>
              <ModeToggle mode={mode} onChange={changeMode} />
            </div>
            <ActivityChart chart={stats.chart} mode={mode} currency={currency} colors={colors}
              selected={selected} onSelect={selectPeriod} />
            <div aria-hidden="true" className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-3">
              {STATS_CATEGORIES.map(cat => (
                <div key={cat} className="flex items-center gap-1.5 text-xs text-fg-subtle">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: colors[cat][0], opacity: colors[cat][1] }} />{CATEGORY_LABELS[cat]}
                </div>
              ))}
            </div>
          </div>
          <Rankings stats={stats} currency={currency} period={rankings} onAssetClick={onAssetClick} />
        </div>
      )}
    </div>
  )
}
