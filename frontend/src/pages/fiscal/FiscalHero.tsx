import { Calendar, CheckCircle2, TrendingUp, TrendingDown, Coins, ListChecks } from 'lucide-react'
import { AnimatedNumber } from '../../components/AnimatedNumber'
import { panelClasses, panelEnterStyle, panelSurface, Skeleton, StatCard } from '../../components/ui'
import { formatEur, formatNumber, formatPercent, pnlColor } from '../../utils/format'
import { T } from '../../utils/colors'
import type { YearComparison } from '../../utils/fiscalHeader'
import type { FiscalSummary } from './types'

// Cabecera protagonista del ejercicio (#297): neto a declarar, cuota del
// ahorro tras compensar pérdidas, estado y comparación con el año anterior.
// Al pie, cuatro StatCard compactas (#418) que abren Operaciones filtrada.

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

export function FiscalHeroSkeleton() {
  return (
    <div className={panelClasses(panelSurface('none', 'rounded-2xl p-6 space-y-4'))}>
      <Skeleton className="h-3 w-40" />
      <Skeleton className="h-10 w-56" />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">{[0, 1, 2, 3].map(i => <Skeleton key={i} className="h-8" />)}</div>
    </div>
  )
}

export function FiscalHero({ summary, cuota, tipoMedio, comparison, aviso, declarada = false, onOpen }: {
  summary: FiscalSummary
  cuota: number
  tipoMedio: number
  comparison: YearComparison | null
  /** Aviso destacado del año, p. ej. pérdidas que caducan (#305). */
  aviso?: React.ReactNode
  /** La Renta del ejercicio ya se marcó como declarada (#311). */
  declarada?: boolean
  /** Abre Operaciones con los filtros dados (#418). */
  onOpen?: (filters: Record<string, string>) => void
}) {
  const neto = summary.netoPatrimonial
  // Versión ligera de los paneles (#419): el brillo de la esquina toma el color del neto.
  const panel = neto > 0.005 ? 'var(--cf-positive)' : neto < -0.005 ? 'var(--cf-negative)' : 'var(--cf-fg-subtle)'
  return (
    <section aria-label={`Resultado fiscal de ${summary.year}`} style={{ ...panelEnterStyle(0), '--panel': panel } as React.CSSProperties}
      className={panelClasses(panelSurface('none', 'rounded-2xl p-6 space-y-5'))}>
      <div className="flex flex-wrap items-start justify-between gap-6">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-[11px] font-semibold uppercase tracking-widest text-fg-subtle">Neto a declarar {summary.year}</h2>
            {summary.esAnioEnCurso
              ? <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-md bg-info/10 text-info-ink"><Calendar size={10} aria-hidden="true" />En curso · hasta hoy</span>
              : declarada
                ? <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-md bg-positive/10 text-positive-ink"><CheckCircle2 size={10} aria-hidden="true" />Declarado</span>
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
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-4 border-t border-border">
        {[
          { title: 'Ganancias', icon: TrendingUp, color: T.positive, tone: 'positive' as const, value: summary.totalGanancias, format: (v: number) => `+${formatEur(v)}`,
            filters: { resultado: 'ganancia' } as Record<string, string>, action: 'Ver las operaciones con ganancia',
            help: 'Suma de las ganancias patrimoniales del ejercicio: ventas y permutas con resultado positivo según el FIFO.' },
          { title: 'Pérdidas', icon: TrendingDown, color: T.negative, tone: 'negative' as const, value: summary.totalPerdidas, format: formatEur,
            filters: { resultado: 'perdida' } as Record<string, string>, action: 'Ver las operaciones con pérdida',
            help: 'Suma de las pérdidas patrimoniales del ejercicio; compensan las ganancias antes de calcular la cuota.' },
          { title: 'Rendimientos', icon: Coins, color: T.warning, tone: undefined, value: summary.totalRendimientos, format: formatEur,
            filters: { seccion: 'rendimientos' } as Record<string, string>, action: 'Ver la tabla de rendimientos',
            help: 'Rendimientos del capital mobiliario: staking, recompensas e intereses a su valor de mercado al recibirlos.' },
          { title: 'Operaciones', icon: ListChecks, color: T.muted, tone: undefined, value: summary.numOperacionesPatrimoniales + summary.numRendimientos, format: (v: number) => formatNumber(v, 0),
            filters: {} as Record<string, string>, action: 'Ver todas las operaciones del ejercicio',
            help: `${summary.numOperacionesPatrimoniales} operaciones patrimoniales y ${summary.numRendimientos} rendimientos en el ejercicio.` },
        ].map((c, i) => (
          <StatCard key={c.title} compact title={c.title} icon={c.icon} color={c.color} tone={c.tone}
            value={c.value} format={c.format} delay={i * 60}
            help={<p>{c.help}</p>} helpLabel={`Qué suma ${c.title}`}
            {...(onOpen && { onSelect: () => onOpen(c.filters), actionLabel: c.action })} />
        ))}
      </div>
    </section>
  )
}
