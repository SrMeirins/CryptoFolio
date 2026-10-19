import { Scale } from 'lucide-react'
import { formatEur, formatPercent } from '../../utils/format'
import { useTramos } from '../../hooks/useTramos'
import { calcularTramos, tramoActivo } from '../../utils/tramosIrpf'
import { tramosScale } from '../../utils/fiscalCharts'
import { FiscalChartCard } from './FiscalChartCard'

export function TramosIRPF({ base, label }: { base: number; label: string }) {
  const tramosConfig = useTramos()
  const tramos = calcularTramos(base, tramosConfig)
  if (tramos.length === 0) return null
  const cuotaTotal   = tramos.reduce((s, t) => s + t.cuota, 0)
  const tipoMedio    = base > 0 ? (cuotaTotal / base) * 100 : 0
  const tipoMarginal = tramoActivo(base, tramosConfig)
  // Escala continua con la base marcada (#301); llega hasta el tramo siguiente.
  const scale = tramosScale(base, tramosConfig)

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
