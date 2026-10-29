import { useId, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ReferenceDot, ResponsiveContainer } from 'recharts'
import { pricesApi } from '../../api/prices'
import type { AssetSale } from '../../api/portfolio'
import { SegmentedControl, Skeleton } from '../../components/ui'
import { useChartColors } from '../../hooks/useChartColors'
import { useReducedMotion } from '../../hooks/useReducedMotion'
import { formatAmount, formatPercent, formatPrice, type Currency } from '../../utils/format'
import { zeroSplit } from '../../utils/zeroSplit'
import { axisPrice, chartMarkers, labelSide, priceSeries, rangeDays, rangeStats, type ChartMarker, type ChartPoint, type ChartRange } from '../../utils/assetPriceChart'
import { zonedFormat } from '../../utils/zonedFormat'

// Gráfico de precio del panel de detalle (#284): cierres diarios y precio en
// vivo, línea del precio medio con zona de beneficio/pérdida, compras de los
// lotes abiertos y ventas, máximo y mínimo del rango y su variación.

const RANGES: { value: ChartRange; label: string; title: string; phrase: string }[] = [
  { value: '30d', label: '30 d', title: 'Últimos 30 días', phrase: 'en los últimos 30 días' },
  { value: '90d', label: '90 d', title: 'Últimos 90 días', phrase: 'en los últimos 90 días' },
  { value: '1y', label: '1 a', title: 'Último año', phrase: 'en el último año' },
  { value: 'all', label: 'Todo', title: 'Desde la primera compra abierta (máx. 400 días)', phrase: 'desde la primera compra abierta' },
]
// Posición de la etiqueta de máximo/mínimo según su lado (no se corta en los bordes).
const SIDE_POSITION = {
  top: { left: 'insideTopRight', right: 'insideTopLeft', center: 'top' },
  bottom: { left: 'insideBottomRight', right: 'insideBottomLeft', center: 'bottom' },
} as const
const DAY = () => zonedFormat('es-ES', { day: 'numeric', month: 'short' })
const DAY_YEAR = () => zonedFormat('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })
const fmtDay = (t: number) => DAY().format(t).replace('.', '')
const fmtDayYear = (t: number) => DAY_YEAR().format(t).replace('.', '')

function PriceTooltip({ active, payload, currency }: { active?: boolean; payload?: { payload: ChartPoint }[]; currency: Currency }) {
  if (!active || !payload?.[0]) return null
  const p = payload[0].payload
  return (
    <div className="glass-tooltip rounded-xl px-3 py-2 text-xs tabular-nums">
      <p className="text-fg-muted">{fmtDayYear(p.t)}</p>
      <p className="mono font-semibold text-fg">{formatPrice(p.price, currency)}</p>
    </div>
  )
}

/** Marca de compra o venta: el detalle va en el <title> del SVG (tooltip nativo). */
function MarkerDot({ cx, cy, marker, color, currency }: { cx?: number; cy?: number; marker: ChartMarker; color: string; currency: Currency }) {
  if (cx === undefined || cy === undefined) return null
  return (
    <g>
      <title>{`${marker.kind === 'compra' ? 'Compra' : 'Venta'} · ${fmtDayYear(marker.t)} · ${formatAmount(marker.quantity)} a ${formatPrice(marker.price, currency)}`}</title>
      <circle cx={cx} cy={cy} r={4.5} fill={color} stroke="var(--cf-bg-card)" strokeWidth={1.5} />
    </g>
  )
}

export function AssetPriceChart({ asset, currency, rate, livePriceEur, avgPrice, buys, sales, firstOpenedAt }: {
  asset: string
  currency: Currency
  /** Unidades de la moneda por EUR en vivo; null en USD sin USDT aún. */
  rate: number | null
  livePriceEur: number | undefined
  /** Precio medio de compra en la moneda elegida. */
  avgPrice: number | null
  buys: ReadonlyArray<{ openedAt: string; quantity: number; unitCost: number }>
  sales: readonly AssetSale[]
  firstOpenedAt: string | null
}) {
  const id = useId().replace(/:/g, '')
  const c = useChartColors()
  const reduceMotion = useReducedMotion()
  const [range, setRange] = useState<ChartRange>('90d')
  const days = rangeDays(range, firstOpenedAt)
  const { data, isLoading, isError } = useQuery({
    queryKey: ['price-closes', days, asset],
    queryFn: () => pricesApi.getCloses([asset], days),
    staleTime: 10 * 60_000,
    placeholderData: prev => prev,
  })

  const points = useMemo(
    () => (data && rate !== null ? priceSeries(data.closes[asset] ?? [], livePriceEur, rate) : []),
    [data, asset, livePriceEur, rate],
  )
  const stats = useMemo(() => rangeStats(points), [points])
  const markers = useMemo(
    () => (points.length > 1 && rate !== null ? chartMarkers(buys, sales, points[0].t, rate) : []),
    [points, buys, sales, rate],
  )
  // Corte verde/rojo en el precio medio: mismo cálculo que el 0 del gráfico de evolución.
  const split = useMemo(() => zeroSplit(points.map(p => p.price - (avgPrice ?? 0))), [points, avgPrice])

  const header = (
    <div className="flex items-center justify-between gap-3 flex-wrap">
      <SegmentedControl options={RANGES} value={range} onChange={setRange} label="Rango del gráfico de precio" />
      {stats?.changePct != null && (
        <span className={`text-xs mono tabular-nums ${stats.changePct >= 0 ? 'text-positive' : 'text-negative'}`}>
          {RANGES.find(r => r.value === range)?.label}: {formatPercent(stats.changePct, 1, true)}
        </span>
      )}
    </div>
  )

  if (isLoading) return <div className="space-y-2">{header}<Skeleton className="h-44 rounded-xl" /></div>
  if (isError || points.length < 2) {
    return (
      <div className="space-y-2">
        {header}
        <p className="text-xs text-fg-subtle rounded-xl border border-border px-3 py-2.5">
          {isError ? 'No se pudo cargar el histórico de precios.' : 'Sin histórico de precios para este activo.'}
        </p>
      </div>
    )
  }

  const hasAvg = avgPrice !== null && avgPrice > 0
  const stroke = !hasAvg ? 'var(--cf-brand)' : split.stroke === null ? (split.solid === 'up' ? c.up : c.down) : `url(#${id}-stroke)`
  const label = `Precio de ${asset} ${RANGES.find(r => r.value === range)?.phrase}: de ${formatPrice(points[0].price, currency)} a ${formatPrice(points[points.length - 1].price, currency)}`

  return (
    <div className="space-y-2">
      {header}
      <div className="h-44" role="img" aria-label={label}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={points} margin={{ top: 16, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id={`${id}-fill`} x1="0" y1="0" x2="0" y2="1">
                <stop offset={0} stopColor={c.up} stopOpacity={0.28} />
                <stop offset={split.fill} stopColor={c.up} stopOpacity={0.05} />
                <stop offset={split.fill} stopColor={c.down} stopOpacity={0.05} />
                <stop offset={1} stopColor={c.down} stopOpacity={0.28} />
              </linearGradient>
              <linearGradient id={`${id}-stroke`} x1="0" y1="0" x2="0" y2="1">
                <stop offset={split.stroke ?? 0} stopColor={c.up} />
                <stop offset={split.stroke ?? 0} stopColor={c.down} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke={c.grid} />
            <XAxis dataKey="t" type="number" scale="time" domain={['dataMin', 'dataMax']} tickFormatter={fmtDay}
              tick={{ fontSize: 10, fill: c.axis }} axisLine={false} tickLine={false} tickCount={4} minTickGap={24} />
            <YAxis domain={['auto', 'auto']} tickFormatter={(v: number) => axisPrice(v, currency)}
              tick={{ fontSize: 10, fill: c.axis }} axisLine={false} tickLine={false} width={60} />
            {hasAvg && (
              <ReferenceLine y={avgPrice} stroke={c.axis} strokeDasharray="4 4" ifOverflow="extendDomain"
                label={{ value: `Precio medio ${formatPrice(avgPrice, currency)}`, position: 'insideBottomLeft', fill: c.axis, fontSize: 10 }} />
            )}
            <Tooltip content={<PriceTooltip currency={currency} />} cursor={{ stroke: c.cursorLine, strokeDasharray: '4 4' }} />
            <Area type="monotone" dataKey="price" baseValue={hasAvg ? avgPrice : 'dataMin'}
              stroke={stroke} strokeWidth={2} fill={hasAvg ? `url(#${id}-fill)` : 'none'} dot={false}
              activeDot={{ r: 3.5, strokeWidth: 0 }} isAnimationActive={!reduceMotion} animationDuration={450} />
            {stats && (
              <>
                <ReferenceDot x={stats.max.t} y={stats.max.price} r={0}
                  label={{ value: `Máx. ${formatPrice(stats.max.price, currency)}`, position: SIDE_POSITION.top[labelSide(stats.max.t, points[0].t, points[points.length - 1].t)], fill: c.axis, fontSize: 10 }} />
                <ReferenceDot x={stats.min.t} y={stats.min.price} r={0}
                  label={{ value: `Mín. ${formatPrice(stats.min.price, currency)}`, position: SIDE_POSITION.bottom[labelSide(stats.min.t, points[0].t, points[points.length - 1].t)], fill: c.axis, fontSize: 10 }} />
              </>
            )}
            {markers.map(m => (
              <ReferenceDot key={`${m.kind}-${m.t}`} x={m.t} y={m.price} ifOverflow="extendDomain"
                shape={(p: { cx?: number; cy?: number }) => (
                  <MarkerDot cx={p.cx} cy={p.cy} marker={m} color={m.kind === 'compra' ? c.up : c.down} currency={currency} />
                )} />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>
      {/* Leyenda: el color no es la única pista (WCAG 1.4.1) */}
      <p className="flex items-center gap-3 flex-wrap text-[11px] text-fg-subtle">
        {hasAvg && <span className="flex items-center gap-1.5"><span className="w-4 border-t border-dashed border-fg-subtle" aria-hidden="true" />Precio medio</span>}
        {markers.some(m => m.kind === 'compra') && <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-positive" aria-hidden="true" />Compras abiertas</span>}
        {markers.some(m => m.kind === 'venta') && <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-negative" aria-hidden="true" />Ventas y permutas</span>}
      </p>
    </div>
  )
}
