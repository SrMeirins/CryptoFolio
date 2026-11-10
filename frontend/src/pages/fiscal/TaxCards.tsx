import { formatEur, formatPercent } from '../../utils/format'
import { calcularTramos, tramoActivo, type Tramo } from '../../utils/tramosIrpf'
import { tramosScale } from '../../utils/fiscalCharts'

// Cálculo por tramos de la base del ahorro (#537): se despliega dentro del
// bloque «Neto a declarar», bajo la cascada, en lugar de un panel aparte.
// Escala continua con la base marcada (#301) hasta el tramo siguiente.
export function CalculoTramos({ id, base, tramos }: { id: string; base: number; tramos: Tramo[] }) {
  const desglose = calcularTramos(base, tramos)
  if (desglose.length === 0) return null
  const cuotaTotal   = desglose.reduce((s, t) => s + t.cuota, 0)
  const tipoMedio    = (cuotaTotal / base) * 100
  const tipoMarginal = tramoActivo(base, tramos)
  const scale = tramosScale(base, tramos)

  return (
    <div id={id} className="pt-4 space-y-3">
      <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-1 text-xs text-fg-subtle">
        <span>Tipo medio <span className="text-fg font-semibold mono">{formatPercent(tipoMedio, 1)}</span></span>
        <span>Tipo marginal <span className="text-fg font-semibold mono">{tipoMarginal} %</span></span>
      </div>
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

      <dl className="space-y-1.5 text-xs">
        {scale.segments.filter(sg => sg.activo).map(sg => (
          <div key={sg.desde} className="flex items-center gap-3">
            <dt className="flex-1 text-fg-subtle">{sg.tipo} % sobre <span className="mono text-fg-muted">{formatEur(sg.base)}</span></dt>
            <dd className="mono font-medium text-fg">{formatEur(sg.cuota)}</dd>
          </div>
        ))}
      </dl>

      {scale.siguiente && (
        <p className="text-xs text-fg-subtle">
          Faltan <span className="mono text-fg-muted">{formatEur(scale.siguiente.faltan)}</span> de base para pasar al tramo del {scale.siguiente.tipo} %.
        </p>
      )}
      <p className="text-xs text-fg-subtle">Estimación orientativa. Base del ahorro, sin considerar deducciones ni mínimo personal.</p>
    </div>
  )
}
