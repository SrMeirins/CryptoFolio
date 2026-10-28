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
// Clicable, el botón cubre la tarjeta por encima del contenido y el chip y la
// ayuda quedan sobre él: pueden ser controles propios sin anidarse (#412).

export interface StatCardProps {
  title: string
  icon?: LucideIcon
  /** En lugar del icono, un elemento propio decorativo (p. ej. un anillo). */
  visual?: ReactNode
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
  /** Un único dato clave bajo la cifra (p. ej. el chip de 24 h); puede ser un control. */
  chip?: ReactNode
  /** Serie real para la mini gráfica; sin serie, no hay gráfica. */
  series?: readonly number[]
  help?: ReactNode
  /** Nombre accesible del botón de ayuda; por defecto «Cómo se calcula <título>». */
  helpLabel?: string
  /** Con `onSelect` la tarjeta es un botón; `actionLabel` completa su nombre accesible. */
  onSelect?: () => void
  active?: boolean
  /** El botón despliega un detalle: se anuncia con aria-expanded en lugar de aria-pressed. */
  expands?: boolean
  actionLabel?: string
  /** Variante compacta: menos relleno y cifra menor, para filas de mini tarjetas. */
  compact?: boolean
  /** Retraso de la entrada escalonada, en ms. */
  delay?: number
}

const TONE = { positive: 'text-positive', negative: 'text-negative' } as const

function Value({ value, format, tone, flash, compact }: Pick<StatCardProps, 'value' | 'format' | 'tone' | 'flash' | 'compact'>) {
  const numeric = typeof value === 'number' && format
  const dir = useFlashOnChange(typeof value === 'number' ? value : 0)
  const flashClass = flash && dir ? (dir === 'up' ? 'flash-up' : 'flash-down') : ''
  return (
    <span className={`block ${compact ? 'mt-2 text-[15px]' : 'mt-3 text-xl'} font-bold mono tabular-nums truncate rounded-md ${tone ? TONE[tone] : 'text-fg'} ${flashClass}`}>
      {numeric ? <AnimatedNumber value={value} format={format} countUp duration={400} /> : value}
    </span>
  )
}

export function StatCard(props: StatCardProps) {
  const {
    title, icon: Icon, visual, color, value, format, loading, chip, series, help, helpLabel,
    onSelect, active = false, expands = false, actionLabel, compact = false, delay = 0,
  } = props
  const text = typeof value === 'number' && format ? format(value) : String(value)
  const iconSize = compact ? 'w-6 h-6' : 'w-7 h-7'

  return (
    <div className="stat-card stat-card-in relative rounded-2xl p-px" data-active={onSelect ? active : undefined}
      style={{ '--card': color, animationDelay: `${delay}ms` } as CSSProperties}>
      <div className={`stat-card-body block w-full h-full rounded-[15px] ${compact ? 'px-3 py-2.5' : 'p-4'} text-left`}>
        <span className="flex items-center gap-2 pr-6">
          {visual ?? (Icon && (
            <span className={`${iconSize} rounded-lg flex items-center justify-center shrink-0`}
              style={{ backgroundColor: `color-mix(in srgb, ${color} 16%, transparent)` }}>
              <Icon size={compact ? 12 : 14} aria-hidden="true" style={{ color }} />
            </span>
          ))}
          <span className={`${compact ? 'text-[10px]' : 'text-[11px]'} text-fg-subtle uppercase tracking-widest truncate`}>{title}</span>
        </span>
        {loading ? <span className={`block ${compact ? 'mt-2 h-5' : 'mt-3 h-7'} w-32 skeleton rounded-lg`} /> : <Value {...props} />}
        {/* Sobre el botón que cubre la tarjeta: el chip puede ser un control propio. */}
        {chip && !loading && <span className="relative z-10 block mt-1.5 w-fit">{chip}</span>}
        {series && series.length > 1 && !loading && (
          <span className="block mt-2 h-7">
            <Sparkline values={series} days={series.length} color={color} decorative className="w-full h-7" />
          </span>
        )}
      </div>
      {onSelect && (
        <button type="button" onClick={onSelect}
          {...(expands ? { 'aria-expanded': active } : { 'aria-pressed': active })}
          aria-label={`${title}: ${text}${actionLabel ? `. ${actionLabel}` : ''}`}
          className="absolute inset-px rounded-[15px] cursor-pointer focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand/60" />
      )}
      {help && (
        // Fuera del botón (sin controles anidados), con zona táctil de 24 px (WCAG 2.5.8).
        <span className="absolute z-10 top-2.5 right-2.5">
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
