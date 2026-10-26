import { formatMoney, type Currency } from '../../utils/format'
import type { FlowBucket } from '../../utils/evolutionSummary'
import { zonedFormat } from '../../utils/zonedFormat'

// Marcadores de depósitos y retiradas del gráfico de evolución (#214).
// - Cada grupo (día, semana o mes según el periodo) tiene una zona de impacto
//   invisible de 24 px (objetivo mínimo de WCAG 2.2): el punto visible es
//   pequeño y antes costaba acertar con el ratón.
// - Se pueden enfocar con Tab; al pasar o enfocar se abre su propio tooltip.
// - Con entradas y salidas en el mismo grupo se dibujan dos puntos (verde
//   arriba, rojo abajo) en vez de compensarlas.

export interface ActiveMarker { bucket: FlowBucket; cx: number; cy: number; chartWidth: number }

type Scale = (v: number) => number
interface AxisMap { [id: string]: { scale: Scale } }

const HIT_RADIUS = 12
const SHORT_DAY = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
const MONTH = new Intl.DateTimeFormat('es-ES', { month: 'long', year: 'numeric', timeZone: 'UTC' })
const DATE_TIME = () => zonedFormat('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })

function bucketLabel(b: FlowBucket, intraday: boolean): string {
  if (intraday) return DATE_TIME().format(new Date(b.anchor.x))
  if (b.unit === 'month') return MONTH.format(new Date(b.start))
  if (b.unit === 'week') return `Semana del ${SHORT_DAY.format(new Date(b.start))}`
  return SHORT_DAY.format(new Date(b.start))
}

function describe(b: FlowBucket, intraday: boolean, currency: Currency): string {
  const parts = [bucketLabel(b, intraday)]
  if (b.deposits >= 0.01) parts.push(`depósitos +${formatMoney(b.deposits, currency)}`)
  if (b.withdrawals >= 0.01) parts.push(`retiradas −${formatMoney(b.withdrawals, currency)}`)
  return parts.join(', ')
}

/** Capa SVG de marcadores; se monta con <Customized>, que inyecta los ejes del gráfico. */
export function FlowMarkerLayer({ xAxisMap, yAxisMap, width = 0, buckets, yKey, colors, active, onActivate, intraday, currency }: {
  xAxisMap?: AxisMap
  yAxisMap?: AxisMap
  width?: number   // ancho del gráfico (lo inyecta recharts), para acotar el tooltip
  buckets: FlowBucket[]
  yKey: 'pct' | 'pnl' | 'value'
  colors: { up: string; down: string; ring: string; bg: string }
  active: ActiveMarker | null
  onActivate: (marker: ActiveMarker | null) => void
  intraday: boolean
  currency: Currency
}) {
  const xScale = xAxisMap ? Object.values(xAxisMap)[0]?.scale : undefined
  const yScale = yAxisMap ? Object.values(yAxisMap)[0]?.scale : undefined
  if (!xScale || !yScale) return null
  return (
    <g className="flow-markers">
      {buckets.map(b => {
        const cx = xScale(b.anchor.x)
        const cy = yScale(b.anchor[yKey])
        if (!Number.isFinite(cx) || !Number.isFinite(cy)) return null
        const both = b.deposits >= 0.01 && b.withdrawals >= 0.01
        const isActive = active?.bucket.start === b.start
        const r = isActive ? 5.5 : 4
        const activate = () => onActivate({ bucket: b, cx, cy, chartWidth: width })
        return (
          <g key={b.start}>
            {isActive && <circle cx={cx} cy={cy} r={HIT_RADIUS - 2} fill="none" stroke={colors.ring} strokeWidth={1.5} />}
            {b.deposits >= 0.01 && <circle cx={cx} cy={both ? cy - 4 : cy} r={r} fill={colors.up} stroke={colors.bg} strokeWidth={2} />}
            {b.withdrawals >= 0.01 && <circle cx={cx} cy={both ? cy + 4 : cy} r={r} fill={colors.down} stroke={colors.bg} strokeWidth={2} />}
            <circle
              cx={cx} cy={cy} r={HIT_RADIUS} fill="transparent" tabIndex={0} role="img"
              aria-label={describe(b, intraday, currency)}
              className="cursor-pointer focus:outline-hidden"
              onMouseEnter={activate} onFocus={activate}
              onMouseLeave={() => onActivate(null)} onBlur={() => onActivate(null)}
            />
          </g>
        )
      })}
    </g>
  )
}

/** Tooltip del marcador activo, posicionado sobre el gráfico (encima del punto, o debajo si no cabe). */
export function FlowMarkerTooltip({ marker, intraday, currency }: { marker: ActiveMarker | null; intraday: boolean; currency: Currency }) {
  if (!marker) return null
  const { bucket: b, cx, cy, chartWidth } = marker
  const below = cy < 72
  // Cerca de los bordes se alinea al lado del punto para no salirse de la tarjeta.
  const EDGE = 110
  const x = cx < EDGE ? '-16px' : chartWidth && cx > chartWidth - EDGE ? 'calc(-100% + 16px)' : '-50%'
  return (
    <div role="tooltip"
      className="absolute z-10 pointer-events-none glass-tooltip rounded-xl px-3 py-2 text-xs whitespace-nowrap"
      style={{ left: cx, top: cy, transform: `translate(${x}, ${below ? '16px' : 'calc(-100% - 16px)'})` }}>
      <p className="text-fg-muted mb-1 first-letter:uppercase">{bucketLabel(b, intraday)}</p>
      {b.deposits >= 0.01 && <p className="mono text-positive">Depósitos +{formatMoney(b.deposits, currency)}</p>}
      {b.withdrawals >= 0.01 && <p className="mono text-negative">Retiradas −{formatMoney(b.withdrawals, currency)}</p>}
      {b.days > 1 && <p className="text-fg-subtle mt-0.5">{b.days} {intraday ? 'tramos' : 'días'} con movimientos</p>}
    </div>
  )
}
