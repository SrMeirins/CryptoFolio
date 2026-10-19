import { AlertTriangle, Hourglass } from 'lucide-react'
import { formatEur } from '../../utils/format'
import { origenesView, totalCaducado, type OrigenView } from '../../utils/perdidasPendientes'
import { badgeClasses } from '../../components/ui'
import { FiscalChartCard } from './FiscalChartCard'
import type { Carryforward } from './types'

// Pérdidas pendientes por año de origen (#305): cuánto se compensó, cuánto
// queda y cuándo caduca cada una. Sustituye a «Compensación de pérdidas».

const ESTADO: Record<OrigenView['estado'], { label: string; cls: string }> = {
  'caduca-este-anio': { label: 'caduca este año', cls: 'bg-warning/15 text-warning' },
  vigente: { label: 'vigente', cls: 'bg-info/10 text-info' },
  agotada: { label: 'compensada', cls: 'bg-positive/10 text-positive' },
  caducada: { label: 'caducada', cls: 'bg-overlay/8 text-fg-subtle' },
}

/** Aviso de las pérdidas que caducan el 31 de diciembre; también lo usa la cabecera del año. */
export function AvisoCaducidad({ importe, years, compact = false }: { importe: number; years: number[]; compact?: boolean }) {
  return (
    <p role="status" className={`flex items-start gap-2 rounded-xl border border-warning/25 bg-warning/5 text-xs text-fg-muted ${compact ? 'px-3 py-2' : 'p-3'}`}>
      <AlertTriangle size={13} className="text-warning shrink-0 mt-0.5" aria-hidden="true" />
      <span>
        <span className="mono font-semibold text-warning">{formatEur(importe)}</span> de pérdidas de {years.join(' y ')} caducan el 31 de diciembre:
        puedes realizar esa ganancia este año sin tributar por ella.
      </span>
    </p>
  )
}

function Fila({ o }: { o: OrigenView }) {
  const e = ESTADO[o.estado]
  return (
    <li className="space-y-1.5">
      <div className="flex items-center gap-2 flex-wrap text-xs">
        <span className="font-semibold text-fg w-10">{o.year}</span>
        <span className={`text-[10px] px-1.5 py-0.5 rounded-md ${e.cls}`}>{e.label}</span>
        <span className="text-fg-subtle">pérdida <span className="mono text-negative">{formatEur(o.original)}</span></span>
        <span className="ml-auto text-right">
          {o.pendiente > 0.005
            ? <><span className="mono font-semibold text-fg">{formatEur(o.pendiente)}</span> <span className="text-fg-subtle">pendiente · hasta el 31 dic {o.caducaEn}</span></>
            : o.caducado > 0.005
              ? <span className="text-fg-subtle"><span className="mono">{formatEur(o.caducado)}</span> caducó sin usar en {o.caducaEn}</span>
              : <span className="text-fg-subtle">compensada por completo</span>}
        </span>
      </div>
      <div className="flex h-2 rounded-full overflow-hidden bg-background-tertiary" role="img"
        aria-label={`${o.year}: compensado ${formatEur(o.compensado)}, pendiente ${formatEur(o.pendiente)}, caducado ${formatEur(o.caducado)}`}>
        <span className="h-full bg-positive/70" style={{ width: `${o.pct.compensado}%` }} />
        <span className={`h-full ${o.estado === 'caduca-este-anio' ? 'bg-warning' : 'bg-info/70'}`} style={{ width: `${o.pct.pendiente}%` }} />
        <span className="h-full bg-fg-subtle/30 bg-[repeating-linear-gradient(45deg,transparent_0_3px,rgb(0_0_0/0.15)_3px_6px)]" style={{ width: `${o.pct.caducado}%` }} />
      </div>
      {o.compensado > 0.005 && (
        <p className="text-[11px] text-fg-subtle">
          {o.compensadoPatrim > 0.005 && o.compensadoRend > 0.005
            ? <>Compensada: <span className="mono">{formatEur(o.compensado)}</span> · {formatEur(o.compensadoPatrim)} con ganancias y {formatEur(o.compensadoRend)} con rendimientos (25 %)</>
            : <>Compensada con {o.compensadoPatrim > 0.005 ? 'ganancias' : 'rendimientos (25 %)'}: <span className="mono">{formatEur(o.compensado)}</span></>}
        </p>
      )}
    </li>
  )
}

export function PerdidasPendientes({ data }: { data: Carryforward }) {
  const origenes = data.origenes ?? []
  if (origenes.length === 0) return null
  // El último ejercicio del cálculo es el año en curso (Madrid), según el backend.
  const currentYear = data.detalle.at(-1)?.year ?? new Date().getFullYear()
  const view = origenesView(origenes, currentYear)
  const caducado = totalCaducado(origenes)

  return (
    <FiscalChartCard icon={Hourglass} title="Pérdidas pendientes de compensar"
      right={data.pendienteTotal > 0.01 && <span className={badgeClasses('info', 'sm', 'mono')}>{formatEur(data.pendienteTotal)} pendiente</span>}>
      {/* El aviso de lo que caduca está en la cabecera del año; aquí basta con destacar su fila (#313). */}
      <ul className="space-y-4">{view.map(o => <Fila key={o.year} o={o} />)}</ul>
      <div className="mt-4 pt-3 border-t border-border space-y-1.5 text-[11px] text-fg-subtle">
        <p className="flex items-center gap-3 flex-wrap">
          <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-positive/70" aria-hidden="true" />Compensado</span>
          <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-info/70" aria-hidden="true" />Pendiente</span>
          <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-warning" aria-hidden="true" />Caduca este año</span>
          <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-fg-subtle/30" aria-hidden="true" />Caducado</span>
        </p>
        <p>Las pérdidas compensan ganancias patrimoniales sin límite y hasta el 25 % de los rendimientos durante los 4 ejercicios siguientes; se usan primero las más antiguas.</p>
        {caducado > 0.005 && <p>Caducadas sin usar en total: <span className="mono text-fg-muted">{formatEur(caducado)}</span>.</p>}
      </div>
    </FiscalChartCard>
  )
}
