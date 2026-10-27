import type { CSSProperties, ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { AnimatedNumber } from '../AnimatedNumber'
import { Sparkline } from '../Sparkline'
import { useFlashOnChange } from '../../hooks/useFlashOnChange'
import { Tooltip } from './Tooltip'

// Tarjeta de métrica común (#409, #410), nacida del resumen del Historial
// (#407): cifra grande que cuenta hasta su valor, mini gráfica opcional, borde
// degradado del color de la tarjeta, elevación y brillo al pasar o con foco y
// entrada escalonada. El texto descriptivo va en la ayuda; como mucho un chip
// con un dato clave. Para métricas, no para paneles grandes (gráficos, tablas).
// «Reducir movimiento» la deja quieta (regla global de index.css).

export interface StatCardProps {
  title: string
  icon?: LucideIcon
  /** Color de la tarjeta (variable CSS del tema): borde, brillo e icono. */
  color: string
  /** Cifra: un número cuenta hasta su valor con `format`; un texto se muestra tal cual. */
  value: number | string
  format?: (v: number) => string
  /** Color de la cifra por su signo (P&L, rentabilidad). */
  tone?: 'positive' | 'negative'
  /** Destello al subir o bajar la cifra (precios en vivo). */
  flash?: boolean
  loading?: boolean
  /** Un único dato clave bajo la cifra (p. ej. el chip de 24 h). */
  chip?: ReactNode
  /** Serie real para la mini gráfica; sin serie, no hay gráfica. */
  series?: readonly number[]
  help?: ReactNode
  /** Nombre accesible del botón de ayuda; por defecto «Cómo se calcula <título>». */
  helpLabel?: string
  /** Con `onSelect` la tarjeta es un botón; `actionLabel` completa su nombre accesible. */
  onSelect?: () => void
  active?: boolean
  actionLabel?: string
  /** Retraso de la entrada escalonada, en ms. */
  delay?: number
}

const TONE = { positive: 'text-positive', negative: 'text-negative' } as const

function Value({ value, format, tone, flash }: Pick<StatCardProps, 'value' | 'format' | 'tone' | 'flash'>) {
  const numeric = typeof value === 'number' && format
  const dir = useFlashOnChange(typeof value === 'number' ? value : 0)
  const flashClass = flash && dir ? (dir === 'up' ? 'flash-up' : 'flash-down') : ''
  return (
    <span className={`block mt-3 text-xl font-bold mono tabular-nums truncate rounded-md ${tone ? TONE[tone] : 'text-fg'} ${flashClass}`}>
      {numeric ? <AnimatedNumber value={value} format={format} countUp duration={400} /> : value}
    </span>
  )
}

export function StatCard(props: StatCardProps) {
  const { title, icon: Icon, color, value, format, loading, chip, series, help, helpLabel, onSelect, active = false, actionLabel, delay = 0 } = props
  const text = typeof value === 'number' && format ? format(value) : String(value)
  const body = (
    <>
      <span className="flex items-center gap-2 pr-6">
        {Icon && (
          <span className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
            style={{ backgroundColor: `color-mix(in srgb, ${color} 16%, transparent)` }}>
            <Icon size={14} aria-hidden="true" style={{ color }} />
          </span>
        )}
        <span className="text-[11px] text-fg-subtle uppercase tracking-widest truncate">{title}</span>
      </span>
      {loading ? <span className="block mt-3 h-7 w-32 skeleton rounded-lg" /> : <Value {...props} />}
      {chip && !loading && <span className="block mt-1.5">{chip}</span>}
      {series && series.length > 1 && !loading && (
        <span className="block mt-2 h-7">
          <Sparkline values={series} days={series.length} color={color} decorative className="w-full h-7" />
        </span>
      )}
    </>
  )
  const bodyClass = 'stat-card-body block w-full h-full rounded-[15px] p-4 text-left'

  return (
    <div className="stat-card stat-card-in relative rounded-2xl p-px" data-active={onSelect ? active : undefined}
      style={{ '--card': color, animationDelay: `${delay}ms` } as CSSProperties}>
      {onSelect ? (
        <button type="button" onClick={onSelect} aria-pressed={active}
          aria-label={`${title}: ${text}${actionLabel ? `. ${actionLabel}` : ''}`}
          className={`${bodyClass} focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand/60`}>
          {body}
        </button>
      ) : (
        <div className={bodyClass}>{body}</div>
      )}
      {help && (
        // Fuera del botón (sin controles anidados), con zona táctil de 24 px (WCAG 2.5.8).
        <span className="absolute top-2.5 right-2.5">
          <Tooltip label={helpLabel ?? `Cómo se calcula ${title}`}
            triggerClassName="w-6 h-6 inline-flex items-center justify-center rounded-full cursor-default text-fg-subtle hover:text-fg-muted focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand/60"
            trigger={<span aria-hidden="true" className="w-3.5 h-3.5 rounded-full flex items-center justify-center text-[11px] font-semibold border border-overlay/10 bg-overlay/5">?</span>}>
            {help}
          </Tooltip>
        </span>
      )}
    </div>
  )
}
