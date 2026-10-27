import type { CSSProperties, ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { AnimatedNumber } from '../../../components/AnimatedNumber'
import { InfoTooltip } from '../../../components/InfoTooltip'
import { Sparkline } from '../../../components/Sparkline'

// Tarjeta del resumen del Historial (#407): solo la cifra, que cuenta hasta su
// valor, y su mini gráfica por mes; el texto va en la ayuda. Pulsarla filtra
// la lista por lo que suma (otra vez, quita el filtro). La ayuda queda fuera
// del botón para no anidar controles.

export function SummaryCard({ title, icon: Icon, color, value, format, series, active, onSelect, help, delay }: {
  title: string
  icon: LucideIcon
  /** Color de la tarjeta (variable CSS del tema). */
  color: string
  value: number
  format: (v: number) => string
  series: readonly number[]
  active: boolean
  onSelect: () => void
  help: ReactNode
  /** Retraso de la entrada escalonada, en ms. */
  delay: number
}) {
  return (
    <div className="summary-card summary-card-in relative rounded-2xl p-px" data-active={active}
      style={{ '--card': color, animationDelay: `${delay}ms` } as CSSProperties}>
      <button type="button" onClick={onSelect} aria-pressed={active}
        aria-label={`${title}: ${format(value)}. ${active ? 'Quitar el filtro de sus operaciones' : 'Ver sus operaciones'}`}
        className="summary-card-body w-full h-full rounded-[15px] p-4 text-left focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand/60">
        <span className="flex items-center gap-2 pr-6">
          <span className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
            style={{ backgroundColor: `color-mix(in srgb, ${color} 16%, transparent)` }}>
            <Icon size={14} aria-hidden="true" style={{ color }} />
          </span>
          <span className="text-[11px] text-fg-subtle uppercase tracking-widest truncate">{title}</span>
        </span>
        <AnimatedNumber value={value} format={format} countUp duration={400}
          className="block mt-3 text-xl font-bold mono text-fg truncate" />
        <span className="block mt-2 h-7">
          <Sparkline values={series} days={series.length} color={color} decorative className="w-full h-7" />
        </span>
      </button>
      {/* Zona táctil de 24 px (WCAG 2.5.8) con el mismo «?» visible de 14 px. */}
      <span className="absolute top-2.5 right-2.5">
        <InfoTooltip label={`Qué suma ${title}`}
          triggerClassName="w-6 h-6 inline-flex items-center justify-center rounded-full cursor-default text-fg-subtle hover:text-fg-muted focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand/60"
          trigger={<span aria-hidden="true" className="w-3.5 h-3.5 rounded-full flex items-center justify-center text-[11px] font-semibold border border-overlay/10 bg-overlay/5">?</span>}>
          {help}
        </InfoTooltip>
      </span>
    </div>
  )
}
