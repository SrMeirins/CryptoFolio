import { useState } from 'react'
import { ChevronDown, Scale } from 'lucide-react'
import { tramosCompactos } from '../../utils/fiscalRendimientos'
import { formatEur, formatPercent } from '../../utils/format'
import { useTramos } from '../../hooks/useTramos'
import { calcularTramos, tramoActivo } from '../../utils/tramosIrpf'
import { tramosScale } from '../../utils/fiscalCharts'
import { FiscalChartCard } from './FiscalChartCard'
import { panelSurface } from '../../components/ui'

export function TramosIRPF({ base, label, year }: { base: number; label: string; year: number }) {
  // Escala del ejercicio (#452).
  const tramosConfig = useTramos(year)
  // Con una base pequeña, una línea basta; la escala completa se despliega (#313).
  const [abierto, setAbierto] = useState(false)
  const tramos = calcularTramos(base, tramosConfig)
  if (tramos.length === 0) return null
  const cuotaTotal   = tramos.reduce((s, t) => s + t.cuota, 0)
  const tipoMedio    = base > 0 ? (cuotaTotal / base) * 100 : 0
  const tipoMarginal = tramoActivo(base, tramosConfig)
  // Escala continua con la base marcada (#301); llega hasta el tramo siguiente.
  const scale = tramosScale(base, tramosConfig)
  if (tramosCompactos(base) && !abierto) {
    return (
      <section aria-label={label} className={panelSurface('none', 'flex items-center gap-3 flex-wrap px-4 py-3 text-sm')}>
        <Scale size={14} className="text-fg-subtle shrink-0" aria-hidden="true" />
        <p className="flex-1 min-w-[14rem] text-fg-muted">
          <span className="text-fg-subtle">{label}:</span> base <span className="mono text-fg">{formatEur(base)}</span> al <span className="mono text-fg">{tipoMarginal} %</span>
          {' '}→ cuota <span className="mono font-semibold text-warning">{formatEur(cuotaTotal)}</span>
        </p>
        <button type="button" onClick={() => setAbierto(true)} aria-expanded={false}
          className="inline-flex items-center gap-1 text-xs text-fg-subtle hover:text-fg rounded-md px-1 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand/60">
          Ver tramos <ChevronDown size={13} aria-hidden="true" />
        </button>
      </section>
    )
  }

  return (
    <FiscalChartCard
      icon={Scale}
      title={label}
      right={
        <div className="flex items-center gap-3 text-xs">
          <span className="text-fg-subtle">Tipo medio <span className="text-fg font-bold mono">{formatPercent(tipoMedio, 1)}</span></span>
          <span className="text-fg-subtle">Tipo marginal <span className="text-warning font-bold mono">{tipoMarginal}%</span></span>
        </div>
      }
    >
      <div className="relative pt-6 pb-1" role="img"
        aria-label={`Base ${formatEur(base)} en el tramo del ${tipoMarginal} %; cuota ${formatEur(cuotaTotal)}`}>
        {/* Marcador de la base: la etiqueta no se sale por los bordes */}
        <div className="absolute top-0 -translate-x-1/2 text-[10px] mono text-fg whitespace-nowrap" style={{ left: `clamp(3rem, ${scale.markerPct}%, calc(100% - 3rem))` }}>
          base {formatEur(base)}
        </div>
        <div className="absolute top-4 h-5 w-0.5 bg-fg rounded-full" style={{ left: `${scale.markerPct}%` }} aria-hidden="true" />
        <div className="flex h-3 gap-0.5">
          {scale.segments.map(sg => (
            <div key={sg.desde} className="relative h-full rounded-sm bg-warning/15 overflow-hidden" style={{ width: `${sg.widthPct}%` }}>
              <div className="absolute inset-y-0 left-0 bg-warning/80" style={{ width: `${sg.fillPct}%` }} />
            </div>
          ))}
        </div>
        <div className="flex gap-0.5 mt-1.5 text-[10px] text-fg-subtle">
          {scale.segments.map(sg => (
            <div key={sg.desde} className="min-w-0" style={{ width: `${sg.widthPct}%` }}>
              <span className="mono font-semibold text-fg-muted">{sg.tipo} %</span>
              <span className="block truncate">{Number.isFinite(sg.hasta) ? `hasta ${formatEur(sg.hasta)}` : `desde ${formatEur(sg.desde)}`}</span>
            </div>
          ))}
        </div>
      </div>

      <dl className="mt-3 space-y-1.5 text-xs">
        {scale.segments.filter(sg => sg.activo).map(sg => (
          <div key={sg.desde} className="flex items-center gap-3">
            <dt className="flex-1 text-fg-subtle">{sg.tipo}% sobre <span className="mono text-fg-muted">{formatEur(sg.base)}</span></dt>
            <dd className="mono font-medium text-fg">{formatEur(sg.cuota)}</dd>
          </div>
        ))}
      </dl>

      {scale.siguiente && (
        <p className="mt-2 text-xs text-fg-subtle">
          Faltan <span className="mono text-fg-muted">{formatEur(scale.siguiente.faltan)}</span> de base para pasar al tramo del {scale.siguiente.tipo} %.
        </p>
      )}

      <div className="mt-3 pt-3 border-t border-border flex items-center justify-between">
        <span className="text-xs text-fg-subtle">Cuota estimada total</span>
        <span className="mono font-bold text-warning">{formatEur(cuotaTotal)}</span>
      </div>
      <p className="text-xs text-fg-subtle mt-1">Estimación orientativa. Base del ahorro, sin considerar deducciones ni mínimo personal.</p>
    </FiscalChartCard>
  )
}
