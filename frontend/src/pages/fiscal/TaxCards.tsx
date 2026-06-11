import { Scale, Info } from 'lucide-react'
import { formatEur } from '../../utils/format'
import { useTramos, calcularTramos, tramoActivo } from './helpers'
import type { Carryforward } from './types'

export function TramosIRPF({ base, label }: { base: number; label: string }) {
  const tramosConfig = useTramos()
  const tramos = calcularTramos(base, tramosConfig)
  if (tramos.length === 0) return null
  const cuotaTotal   = tramos.reduce((s, t) => s + t.cuota, 0)
  const tipoMedio    = base > 0 ? (cuotaTotal / base) * 100 : 0
  const tipoMarginal = tramoActivo(base, tramosConfig)

  return (
    <div className="bg-background-card border border-border rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Scale size={15} className="text-gray-500" />
          <h3 className="text-[11px] text-gray-500 font-medium uppercase tracking-widest">{label}</h3>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <span className="text-gray-500">Tipo medio <span className="text-white font-bold mono">{tipoMedio.toFixed(1)}%</span></span>
          <span className="text-gray-500">Tipo marginal <span className="text-accent-amber font-bold mono">{tipoMarginal}%</span></span>
        </div>
      </div>

      <div className="space-y-2">
        {tramosConfig.filter((_, i) => i < tramos.length || (i === 0 && base <= 0)).map((t, i) => {
          const info  = tramos[i]
          const activo = info != null
          const pct   = activo ? Math.min((info.cuota / cuotaTotal) * 100, 100) : 0
          return (
            <div key={i} className={`flex items-center gap-3 ${activo ? '' : 'opacity-25'}`}>
              <div className="w-24 text-[10px] text-gray-500 shrink-0">{t.label}</div>
              <div className="flex-1 h-1.5 bg-background-tertiary rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${pct}%`, backgroundColor: activo ? '#f59e0b' : '#374151' }}
                />
              </div>
              <div className="w-8 text-[10px] text-gray-500 text-right">{t.tipo}%</div>
              <div className="w-20 text-right mono text-xs font-medium text-white shrink-0">
                {activo ? formatEur(info.cuota) : '—'}
              </div>
            </div>
          )
        })}
      </div>

      <div className="mt-3 pt-3 border-t border-border flex items-center justify-between">
        <span className="text-xs text-gray-500">Cuota estimada total</span>
        <span className="mono font-bold text-accent-amber">{formatEur(cuotaTotal)}</span>
      </div>
      <p className="text-[10px] text-gray-600 mt-1">Estimación orientativa. Base del ahorro, sin considerar deducciones ni mínimo personal.</p>
    </div>
  )
}

export function CompensacionPerdidas({ data }: { data: Carryforward }) {
  if (data.pendienteTotal < 0.01 && data.detalle.every(d => d.perdida < 0.01)) return null

  return (
    <div className="bg-background-card border border-border rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Scale size={15} className="text-gray-500" />
          <h3 className="text-[11px] text-gray-500 font-medium uppercase tracking-widest">Compensación de pérdidas (4 años)</h3>
        </div>
        {data.pendienteTotal > 0.01 && (
          <span className="text-xs bg-accent-blue/10 text-accent-blue px-2 py-0.5 rounded-full font-medium mono">
            {formatEur(data.pendienteTotal)} pendiente
          </span>
        )}
      </div>

      <div className="space-y-1.5">
        {data.detalle.map((d) => (
          <div key={d.year} className="flex items-center gap-3 text-xs flex-wrap">
            <span className="w-10 text-gray-500 font-medium">{d.year}</span>
            {d.perdida > 0.01 ? (
              <>
                <span className="text-accent-red mono">−{formatEur(d.perdida)}</span>
                {d.compensadoPatrim > 0.01 && (
                  <span className="text-accent-green mono">+{formatEur(d.compensadoPatrim)} vs patrimonio</span>
                )}
                {d.compensadoRend > 0.01 && (
                  <span className="text-accent-amber mono">+{formatEur(d.compensadoRend)} vs rendimientos</span>
                )}
              </>
            ) : d.netoAntes > 0 ? (
              <span className="text-gray-600 mono">+{formatEur(d.netoAntes)} ganancias</span>
            ) : (
              <span className="text-gray-700">Sin operaciones</span>
            )}
          </div>
        ))}
      </div>

      {data.pendienteTotal > 0.01 && (
        <div className="mt-3 pt-3 border-t border-border flex items-start gap-2 text-xs text-accent-blue">
          <Info size={12} className="shrink-0 mt-0.5" />
          <span>
            Puedes compensar {formatEur(data.pendienteTotal)} de pérdidas pendientes con ganancias patrimoniales futuras
            o hasta el 25% de rendimientos positivos (máx. 4 años desde su generación).
          </span>
        </div>
      )}
    </div>
  )
}
