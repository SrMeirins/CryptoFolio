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
// - Con `franja` (#510) van en una franja bajo el gráfico, fuera de la curva:
//   triángulo hacia arriba para depósitos y hacia abajo para retiradas (la
//   forma distingue el tipo, no solo el color).

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
export function FlowMarkerLayer({ xAxisMap, yAxisMap, offset, width = 0, buckets, yKey, colors, active, onActivate, intraday, currency, franja = false }: {
  xAxisMap?: AxisMap
  yAxisMap?: AxisMap
  offset?: { top: number; left: number; width: number; height: number }
  /** En una franja bajo el gráfico en lugar de sobre la curva (#510). */
  franja?: boolean
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
  // Franja: a media altura del margen inferior, bajo las fechas del eje.
  const yFranja = offset ? offset.top + offset.height + 34 : 0
  return (
    <g className="flow-markers">
      {franja && offset && (
        <line x1={offset.left} x2={offset.left + offset.width} y1={yFranja} y2={yFranja} stroke={colors.ring} strokeOpacity={0.25} />
      )}
      {buckets.map(b => {
        const cx = xScale(b.anchor.x)
        const cy = franja ? yFranja : yScale(b.anchor[yKey])
        if (!Number.isFinite(cx) || !Number.isFinite(cy)) return null
        if (franja && offset && (cx < offset.left - 1 || cx > offset.left + offset.width + 1)) return null
        const both = b.deposits >= 0.01 && b.withdrawals >= 0.01
        const isActive = active?.bucket.start === b.start
        const r = isActive ? 5.5 : 4
        const activate = () => onActivate({ bucket: b, cx, cy, chartWidth: width })
        const tri = (dir: 1 | -1, dx: number) => `M ${cx + dx - r} ${cy + dir * r * 0.6} L ${cx + dx + r} ${cy + dir * r * 0.6} L ${cx + dx} ${cy - dir * r} Z`
        return (
          <g key={b.start}>
            {isActive && <circle cx={cx} cy={cy} r={HIT_RADIUS - 2} fill="none" stroke={colors.ring} strokeWidth={1.5} />}
            {franja ? <>
              {b.deposits >= 0.01 && <path d={tri(1, both ? -4 : 0)} fill={colors.up} />}
              {b.withdrawals >= 0.01 && <path d={tri(-1, both ? 4 : 0)} fill={colors.down} />}
            </> : <>
              {b.deposits >= 0.01 && <circle cx={cx} cy={both ? cy - 4 : cy} r={r} fill={colors.up} stroke={colors.bg} strokeWidth={2} />}
              {b.withdrawals >= 0.01 && <circle cx={cx} cy={both ? cy + 4 : cy} r={r} fill={colors.down} stroke={colors.bg} strokeWidth={2} />}
            </>}
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
      className="absolute z-10 pointer-events-none rounded-lg border border-border bg-background-card shadow-xl px-3 py-2 text-xs whitespace-nowrap"
      style={{ left: cx, top: cy, transform: `translate(${x}, ${below ? '16px' : 'calc(-100% - 16px)'})` }}>
      <p className="text-fg-muted mb-1 first-letter:uppercase">{bucketLabel(b, intraday)}</p>
      {b.deposits >= 0.01 && <p className="mono text-positive">Depósitos +{formatMoney(b.deposits, currency)}</p>}
      {b.withdrawals >= 0.01 && <p className="mono text-negative">Retiradas −{formatMoney(b.withdrawals, currency)}</p>}
      {b.days > 1 && <p className="text-fg-subtle mt-0.5">{b.days} {intraday ? 'tramos' : 'días'} con movimientos</p>}
    </div>
  )
}
