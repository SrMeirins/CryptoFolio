import { Calendar, CheckCircle2 } from 'lucide-react'
import { AnimatedNumber } from '../../components/AnimatedNumber'
import { panelClasses, panelEnterStyle, Skeleton } from '../../components/ui'
import { formatEur, formatPercent, pnlColor } from '../../utils/format'
import type { YearComparison } from '../../utils/fiscalHeader'
import type { FiscalSummary } from './types'

// Cabecera protagonista del ejercicio (#297): neto a declarar, cuota del
// ahorro tras compensar pérdidas, estado y comparación con el año anterior.

const signed = (v: number) => `${v >= 0 ? '+' : ''}${formatEur(v)}`

function Delta({ value, label, invert = false }: { value: number; label: string; invert?: boolean }) {
  // En la cuota, pagar más es peor: el color se invierte.
  const tone = Math.abs(value) < 0.005 ? 'text-fg-subtle' : (value > 0) !== invert ? 'text-positive' : 'text-negative'
  return (
    <p className="text-xs text-fg-subtle mt-1">
      <span className={`mono font-medium ${tone}`}>{signed(value)}</span> vs {label}
    </p>
  )
}

function Mini({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] uppercase tracking-wider text-fg-subtle">{label}</dt>
      <dd className="mono tabular-nums text-sm font-semibold mt-0.5 break-words">{children}</dd>
    </div>
  )
}

export function FiscalHeroSkeleton() {
  return (
    <div className={panelClasses('rounded-2xl border border-border bg-background-card p-6 space-y-4')}>
      <Skeleton className="h-3 w-40" />
      <Skeleton className="h-10 w-56" />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">{[0, 1, 2, 3].map(i => <Skeleton key={i} className="h-8" />)}</div>
    </div>
  )
}

export function FiscalHero({ summary, cuota, tipoMedio, comparison, aviso }: {
  summary: FiscalSummary
  cuota: number
  tipoMedio: number
  comparison: YearComparison | null
  /** Aviso destacado del año, p. ej. pérdidas que caducan (#305). */
  aviso?: React.ReactNode
}) {
  const neto = summary.netoPatrimonial
  const tint = neto > 0.005 ? 'from-positive/10' : neto < -0.005 ? 'from-negative/10' : 'from-overlay/5'
  return (
    <section aria-label={`Resultado fiscal de ${summary.year}`} style={panelEnterStyle(0)}
      className={panelClasses(`rounded-2xl border border-border bg-background-card bg-linear-to-br ${tint} to-transparent p-6 space-y-5`)}>
      <div className="flex flex-wrap items-start justify-between gap-6">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-[11px] font-semibold uppercase tracking-widest text-fg-subtle">Neto a declarar {summary.year}</h2>
            {summary.esAnioEnCurso
              ? <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-md bg-info/10 text-info"><Calendar size={10} aria-hidden="true" />En curso · hasta hoy</span>
              : <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-md bg-overlay/8 text-fg-muted"><CheckCircle2 size={10} aria-hidden="true" />Cerrado</span>}
          </div>
          <AnimatedNumber value={neto} format={signed} className={`block text-4xl font-bold mono tabular-nums mt-2 break-words ${pnlColor(neto)}`} />
          {comparison && <Delta value={comparison.netoDelta} label={comparison.label} />}
        </div>
        <div className="sm:text-right min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-fg-subtle">Cuota IRPF estimada</p>
          <AnimatedNumber value={cuota} format={formatEur} className="block text-2xl font-bold mono tabular-nums mt-2 text-warning break-words" />
          <p className="text-xs text-fg-subtle mt-1">
            {cuota > 0.005
              ? <>tipo medio <span className="mono text-fg-muted">{formatPercent(tipoMedio, 1)}</span> · tras compensar pérdidas</>
              : 'sin cuota: pérdidas o base nula'}
          </p>
          {comparison?.cuotaDelta != null && <Delta value={comparison.cuotaDelta} label={comparison.label} invert />}
        </div>
      </div>
      {aviso}
      <dl className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-4 border-t border-border">
        <Mini label="Ganancias"><span className="text-positive">+{formatEur(summary.totalGanancias)}</span></Mini>
        <Mini label="Pérdidas"><span className="text-negative">{formatEur(summary.totalPerdidas)}</span></Mini>
        <Mini label="Rendimientos"><span className="text-warning">{formatEur(summary.totalRendimientos)}</span></Mini>
        <Mini label="Operaciones"><span className="text-fg">{summary.numOperacionesPatrimoniales + summary.numRendimientos}</span></Mini>
      </dl>
    </section>
  )
}
