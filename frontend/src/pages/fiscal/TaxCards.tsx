import { Scale, Info } from 'lucide-react'
import { formatEur } from '../../utils/format'
import { useTramos } from '../../hooks/useTramos'
import { calcularTramos, tramoActivo } from '../../utils/tramosIrpf'
import { FiscalChartCard } from './FiscalChartCard'
import type { Carryforward } from './types'
import { T } from '../../utils/colors'
import { badgeClasses } from '../../components/ui'

export function TramosIRPF({ base, label }: { base: number; label: string }) {
  const tramosConfig = useTramos()
  const tramos = calcularTramos(base, tramosConfig)
  if (tramos.length === 0) return null
  const cuotaTotal   = tramos.reduce((s, t) => s + t.cuota, 0)
  const tipoMedio    = base > 0 ? (cuotaTotal / base) * 100 : 0
  const tipoMarginal = tramoActivo(base, tramosConfig)

  return (
    <FiscalChartCard
      icon={Scale}
      title={label}
      right={
        <div className="flex items-center gap-3 text-xs">
          <span className="text-fg-subtle">Tipo medio <span className="text-fg font-bold mono">{tipoMedio.toFixed(1)}%</span></span>
          <span className="text-fg-subtle">Tipo marginal <span className="text-warning font-bold mono">{tipoMarginal}%</span></span>
        </div>
      }
    >
      <div className="space-y-2">
        {/* tramosConfig siempre tiene >= tramos.length entradas: el único
            caso en que tramos queda vacío (base <= 0) ya se descarta arriba. */}
        {tramosConfig.slice(0, tramos.length).map((t, i) => {
          const info  = tramos[i]
          const activo = info != null
          const pct   = activo ? Math.min((info.cuota / cuotaTotal) * 100, 100) : 0
          return (
            <div key={t.label} className={`flex items-center gap-3 ${activo ? '' : 'opacity-25'}`}>
              <div className="w-24 text-xs text-fg-subtle shrink-0">{t.label}</div>
              <div className="flex-1 h-1.5 bg-background-tertiary rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${pct}%`, backgroundColor: activo ? T.warning : T.track }}
                />
              </div>
              <div className="w-8 text-xs text-fg-subtle text-right">{t.tipo}%</div>
              <div className="w-20 text-right mono text-xs font-medium text-fg shrink-0">
                {activo ? formatEur(info.cuota) : '—'}
              </div>
            </div>
          )
        })}
      </div>

      <div className="mt-3 pt-3 border-t border-border flex items-center justify-between">
        <span className="text-xs text-fg-subtle">Cuota estimada total</span>
        <span className="mono font-bold text-warning">{formatEur(cuotaTotal)}</span>
      </div>
      <p className="text-xs text-fg-subtle mt-1">Estimación orientativa. Base del ahorro, sin considerar deducciones ni mínimo personal.</p>
    </FiscalChartCard>
  )
}

export function CompensacionPerdidas({ data }: { data: Carryforward }) {
  if (data.pendienteTotal < 0.01 && data.detalle.every(d => d.perdida < 0.01)) return null

  return (
    <FiscalChartCard
      icon={Scale}
      title="Compensación de pérdidas (4 años)"
      right={data.pendienteTotal > 0.01 && (
        <span className={badgeClasses('info', 'sm', 'mono')}>
          {formatEur(data.pendienteTotal)} pendiente
        </span>
      )}
    >
      <div className="space-y-1.5">
        {data.detalle.map((d) => (
          <div key={d.year} className="flex items-center gap-3 text-xs flex-wrap">
            <span className="w-10 text-fg-subtle font-medium">{d.year}</span>
            {d.perdida > 0.01 ? (
              <>
                <span className="text-negative mono">−{formatEur(d.perdida)}</span>
                {d.compensadoPatrim > 0.01 && (
                  <span className="text-positive mono">+{formatEur(d.compensadoPatrim)} vs patrimonio</span>
                )}
                {d.compensadoRend > 0.01 && (
                  <span className="text-warning mono">+{formatEur(d.compensadoRend)} vs rendimientos</span>
                )}
              </>
            ) : d.netoAntes > 0 ? (
              <span className="text-fg-subtle mono">+{formatEur(d.netoAntes)} ganancias</span>
            ) : (
              <span className="text-fg-subtle">Sin operaciones</span>
            )}
          </div>
        ))}
      </div>

      {data.pendienteTotal > 0.01 && (
        <div className="mt-3 pt-3 border-t border-border flex items-start gap-2 text-xs text-info">
          <Info size={12} className="shrink-0 mt-0.5" />
          <span>
            Puedes compensar {formatEur(data.pendienteTotal)} de pérdidas pendientes con ganancias patrimoniales futuras
            o hasta el 25% de rendimientos positivos (máx. 4 años desde su generación).
          </span>
        </div>
      )}
    </FiscalChartCard>
  )
}
