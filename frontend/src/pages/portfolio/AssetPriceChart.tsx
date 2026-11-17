import { useId, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ReferenceDot, ResponsiveContainer, Customized } from 'recharts'
import { Maximize2, ZoomIn, ZoomOut } from 'lucide-react'
import { pricesApi } from '../../api/prices'
import type { AssetSale, ClosedBuy } from '../../api/portfolio'
import { LiveDot } from '../dashboard/LiveDot'
import { Dropdown, Hint, iconButtonClasses, SegmentedControl, Skeleton, QueryError } from '../../components/ui'
import { useChartColors } from '../../hooks/useChartColors'
import { useReducedMotion } from '../../hooks/useReducedMotion'
import { useChartZoom } from '../../hooks/useChartZoom'
import { useMarcasGrafico } from '../../hooks/useMarcasGrafico'
import { formatAmount, formatPercent, formatPrice, type Currency } from '../../utils/format'
import { zeroSplit } from '../../utils/zeroSplit'
import { axisPrice, chartMarkers, labelSide, operationDays, priceSeries, rangeDays, rangeStats, samplePoints, type ChartMarker, type ChartPoint, type ChartRange } from '../../utils/assetPriceChart'
import { esCompleta, puntosEnVentana, rangoDeVentana, ventanaRango } from '../../utils/chartZoom'
import { MARCAS_OPCIONES, type MarcasGrafico } from '../../utils/graficoMarcas'
import { zonedFormat } from '../../utils/zonedFormat'
import { NavegadorPrecio } from './detalle/NavegadorPrecio'
import { FRANJA_BANDERAS, MarcasBanderas } from './detalle/MarcasBanderas'

// Gráfico de precio del panel de detalle (#284, rehecho en #528): cierres
// diarios de toda la historia y precio en vivo, línea del precio medio con
// zona de beneficio/pérdida, compras abiertas, compras ya vendidas y ventas
// (como puntos o como banderas fuera de la línea, a elegir aquí y en Ajustes),
// máximo y mínimo de lo visible. Zoom como en un exchange: rueda centrada en
// el cursor, arrastrar para desplazar, navegador con toda la historia,
// teclado y botones; «Restablecer» y el doble clic vuelven a la vista inicial.

const RANGES: { value: ChartRange; label: string; title: string; phrase: string }[] = [
  { value: '30d', label: '30 d', title: 'Últimos 30 días', phrase: 'en los últimos 30 días' },
  { value: '90d', label: '90 d', title: 'Últimos 90 días', phrase: 'en los últimos 90 días' },
  { value: '1y', label: '1 a', title: 'Último año', phrase: 'en el último año' },
  { value: 'all', label: 'Todo', title: 'Desde la primera compra', phrase: 'desde la primera compra' },
]
// Posición de la etiqueta de máximo/mínimo según su lado (no se corta en los bordes).
const SIDE_POSITION = {
  top: { left: 'insideTopRight', right: 'insideTopLeft', center: 'top' },
  bottom: { left: 'insideBottomRight', right: 'insideBottomLeft', center: 'bottom' },
} as const
// Área de trazado dentro del contenedor: eje Y de 60 px a la izquierda y 8 px a la derecha.
const INSET = { left: 60, right: 8 }
const DAY = () => zonedFormat('es-ES', { day: 'numeric', month: 'short' })
const DAY_YEAR = () => zonedFormat('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })
const MONTH_YEAR = () => zonedFormat('es-ES', { month: 'short', year: '2-digit' })
const fmtDay = (t: number) => DAY().format(t).replace('.', '')
const fmtDayYear = (t: number) => DAY_YEAR().format(t).replace('.', '')
const fmtMonth = (t: number) => MONTH_YEAR().format(t).replace('.', '')

const NO_CLOSED: readonly ClosedBuy[] = []
const NO_DAYS: ReadonlySet<string> = new Set()
const MARKER_LABEL: Record<ChartMarker['kind'], string> = { compra: 'Compra abierta', 'compra-vendida': 'Compra ya vendida', venta: 'Venta o permuta' }

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

/** Marca de compra o venta sobre la línea: el detalle va en el <title> del SVG (tooltip nativo). */
function MarkerDot({ cx, cy, marker, color, label, highlighted }: { cx?: number; cy?: number; marker: ChartMarker; color: string; label: string; highlighted: boolean }) {
  if (cx === undefined || cy === undefined) return null
  const r = highlighted ? 6.5 : 4.5
  return (
    <g data-marker={marker.kind} data-day={marker.day} data-resaltada={highlighted || undefined}>
      <title>{label}</title>
      {highlighted && <circle cx={cx} cy={cy} r={r + 4} fill="none" stroke={color} strokeWidth={1.5} opacity={0.6} />}
      {marker.kind === 'venta'
        ? <path d={`M ${cx - r} ${cy - r * 0.8} L ${cx + r} ${cy - r * 0.8} L ${cx} ${cy + r} Z`} fill={color} stroke="var(--cf-bg-card)" strokeWidth={1.5} strokeLinejoin="round" />
        : marker.kind === 'compra-vendida'
          ? <circle cx={cx} cy={cy} r={r - 0.5} fill="var(--cf-bg-card)" stroke={color} strokeWidth={2} />
          : <circle cx={cx} cy={cy} r={r} fill={color} stroke="var(--cf-bg-card)" strokeWidth={1.5} />}
    </g>
  )
}

/** Leyenda: forma y texto de cada marca (el color no es la única pista, WCAG 1.4.1). */
function Leyenda({ markers, hasAvg, live, marcas }: { markers: readonly ChartMarker[]; hasAvg: boolean; live: boolean; marcas: MarcasGrafico }) {
  const banderas = marcas !== 'puntos'
  const has = (k: ChartMarker['kind']) => markers.some(m => m.kind === k)
  return (
    <p className="flex items-center gap-3 flex-wrap text-[11px] text-fg-subtle">
      {hasAvg && <span className="flex items-center gap-1.5"><span className="w-4 border-t border-dashed border-fg-subtle" aria-hidden="true" />Precio medio</span>}
      {has('compra') && <span className="flex items-center gap-1.5">
        {banderas ? <svg width="10" height="8" viewBox="0 0 10 8" aria-hidden="true"><path d="M1 0.5 L9 4 L1 7.5 Z" className="fill-positive" /></svg>
          : <span className="w-2 h-2 rounded-full bg-positive" aria-hidden="true" />}Compras abiertas</span>}
      {has('compra-vendida') && <span className="flex items-center gap-1.5">
        {banderas ? <svg width="10" height="8" viewBox="0 0 10 8" aria-hidden="true"><path d="M1 0.5 L9 4 L1 7.5 Z" fill="none" className="stroke-positive" strokeWidth="1.4" /></svg>
          : <span className="w-2 h-2 rounded-full border-2 border-positive" aria-hidden="true" />}Compras ya vendidas</span>}
      {has('venta') && <span className="flex items-center gap-1.5">
        {banderas ? <span className="w-2 h-1.5 rounded-[1px] bg-negative" aria-hidden="true" />
          : <svg width="9" height="8" viewBox="0 0 9 8" aria-hidden="true"><path d="M0 0 L9 0 L4.5 8 Z" className="fill-negative" /></svg>}Ventas y permutas</span>}
      {live && <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-fg-muted" aria-hidden="true" />Precio en vivo</span>}
    </p>
  )
}

export function AssetPriceChart({ asset, currency, rate, livePriceEur, avgPrice, buys, sales, closedBuys = NO_CLOSED, firstOpenedAt, highlightDay = null }: {
  asset: string
  currency: Currency
  /** Unidades de la moneda por EUR en vivo; null en USD sin USDT aún. */
  rate: number | null
  livePriceEur: number | undefined
  /** Precio medio de compra en la moneda elegida. */
  avgPrice: number | null
  buys: ReadonlyArray<{ openedAt: string; quantity: number; unitCost: number }>
  sales: readonly AssetSale[]
  /** Compras ya vendidas del todo (#528), en EUR. */
  closedBuys?: readonly ClosedBuy[]
  /** Primera compra del activo, también de lo ya vendido: inicio de «Todo» (#523). */
  firstOpenedAt: string | null
  /** Día (AAAA-MM-DD) de la venta señalada en la lista (#528). */
  highlightDay?: string | null
}) {
  const id = useId().replace(/:/g, '')
  const c = useChartColors()
  const reduceMotion = useReducedMotion()
  const { marcas, cambiar: cambiarMarcas } = useMarcasGrafico()
  // Toda la historia de una vez; los rangos rápidos y el zoom eligen qué tramo se ve.
  const days = rangeDays('all', firstOpenedAt)
  const priceQ = useQuery({
    queryKey: ['price-closes', days, asset],
    queryFn: () => pricesApi.getCloses([asset], days),
    staleTime: 10 * 60_000,
    placeholderData: prev => prev,
  })
  const { data, isLoading, isError } = priceQ

  const full = useMemo(
    () => (data && rate !== null ? priceSeries(data.closes[asset] ?? [], livePriceEur, rate) : []),
    [data, asset, livePriceEur, rate],
  )
  const extent = full.length > 1 ? { from: full[0].t, to: full[full.length - 1].t } : null
  const { v, containerRef, arrastrando, setVentana, reset, acercar, alejar, handlers } = useChartZoom(extent, INSET)
  const rango = v && extent ? rangoDeVentana(v, extent) : 'all'
  // Límites de la ventana como primitivas: las dependencias de los useMemo no cambian por identidad.
  const vf = v?.from ?? 0
  const vt = v?.to ?? 0
  const keepDays = useMemo(() => operationDays(buys, sales, closedBuys), [buys, sales, closedBuys])
  // Muestreo sobre lo visible: al acercar se ven todos los cierres del tramo.
  const points = useMemo(() => (vt > vf ? samplePoints(puntosEnVentana(full, { from: vf, to: vt }), keepDays) : []), [full, vf, vt, keepDays])
  const overview = useMemo(() => samplePoints(full, NO_DAYS, 240), [full])
  const stats = useMemo(() => rangeStats(points.filter(p => p.t >= vf && p.t <= vt)), [points, vf, vt])
  const markers = useMemo(
    () => (vt > vf && rate !== null ? chartMarkers(buys, sales, vf, rate, closedBuys).filter(m => m.t <= vt + 43_200_000) : []),
    [vf, vt, buys, sales, rate, closedBuys],
  )
  // Corte verde/rojo en el precio medio: mismo cálculo que el 0 del gráfico de evolución.
  const split = useMemo(() => zeroSplit(points.map(p => p.price - (avgPrice ?? 0))), [points, avgPrice])
  const span = v ? v.to - v.from : 0
  const tickFormatter = span > 200 * 86_400_000 ? fmtMonth : fmtDay

  const header = (
    <div className="flex items-center justify-between gap-2 flex-wrap">
      <SegmentedControl options={RANGES} value={(rango ?? '') as ChartRange} label="Rango del gráfico de precio"
        onChange={r => extent && setVentana(r === 'all' ? null : ventanaRango(r, extent))} />
      <div className="flex items-center gap-1">
        <Hint label="Acercar (+ o rueda del ratón)">
          <button type="button" onClick={acercar} disabled={!v} className={iconButtonClasses('sm')} aria-label="Acercar el gráfico">
            <ZoomIn size={14} aria-hidden="true" />
          </button>
        </Hint>
        <Hint label="Alejar (- o rueda del ratón)">
          <button type="button" onClick={alejar} disabled={!v || (extent !== null && esCompleta(v, extent))} className={iconButtonClasses('sm')} aria-label="Alejar el gráfico">
            <ZoomOut size={14} aria-hidden="true" />
          </button>
        </Hint>
        <Hint label="Volver a la vista inicial (doble clic o Inicio)">
          <button type="button" onClick={reset} className={`${iconButtonClasses('sm')} gap-1 px-2 w-auto text-[11px]`} aria-label="Restablecer la vista del gráfico">
            <Maximize2 size={13} aria-hidden="true" /> Restablecer
          </button>
        </Hint>
        <Dropdown label="Marcas de las operaciones" value={marcas} size="sm" align="end" className="w-36"
          options={MARCAS_OPCIONES.map(o => ({ value: o.value, label: o.label }))}
          onChange={m => void cambiarMarcas(m)} />
      </div>
    </div>
  )

  if (isLoading) return <div className="space-y-2">{header}<Skeleton className="h-64 rounded-xl" /></div>
  if (isError) return <QueryError what="el histórico de precios" error={priceQ.error} onRetry={() => void priceQ.refetch()} />
  if (points.length < 2 || !v || !extent) {
    return (
      <div className="space-y-2">
        {header}
        <p className="text-xs text-fg-subtle rounded-xl border border-border px-3 py-2.5">
          Sin histórico de precios para este activo.
        </p>
      </div>
    )
  }

  const hasAvg = avgPrice !== null && avgPrice > 0
  const stroke = !hasAvg ? 'var(--cf-brand)' : split.stroke === null ? (split.solid === 'up' ? c.up : c.down) : `url(#${id}-stroke)`
  const first = points.find(p => p.t >= v.from) ?? points[0]
  const last = [...points].reverse().find(p => p.t <= v.to) ?? points[points.length - 1]
  const changePct = first.price > 0 ? ((last.price - first.price) / first.price) * 100 : null
  const phrase = rango ? RANGES.find(r => r.value === rango)?.phrase : `del ${fmtDayYear(v.from)} al ${fmtDayYear(v.to)}`
  const label = `Precio de ${asset} ${phrase}: de ${formatPrice(first.price, currency)} a ${formatPrice(last.price, currency)}. Usa más y menos para acercar o alejar, las flechas para desplazarte e Inicio para volver a la vista inicial.`
  const liveVisible = livePriceEur !== undefined && v.to >= extent.to - 43_200_000
  const etiqueta = (m: ChartMarker) => `${MARKER_LABEL[m.kind]} · ${fmtDayYear(m.t)} · ${formatAmount(m.quantity)} a ${formatPrice(m.price, currency)}`
  const margin = {
    top: marcas === 'banderas-arriba' ? 16 + FRANJA_BANDERAS : 16,
    right: INSET.right, left: 0,
    bottom: marcas === 'banderas-abajo' ? FRANJA_BANDERAS : 0,
  }

  return (
    <div className="space-y-2">
      {header}
      <div className="flex items-center justify-between gap-2 text-[11px] text-fg-subtle">
        <span>{rango ? RANGES.find(r => r.value === rango)?.title : `Del ${fmtDayYear(v.from)} al ${fmtDayYear(v.to)}`}</span>
        {changePct !== null && (
          <span className={`mono tabular-nums ${changePct >= 0 ? 'text-positive-ink' : 'text-negative-ink'}`}>
            {formatPercent(changePct, 1, true)} en el tramo visible
          </span>
        )}
      </div>
      <div ref={containerRef} {...handlers} tabIndex={0} role="img" aria-label={label} data-testid="grafico-precio"
        className={`h-64 rounded-lg select-none touch-none outline-hidden focus-visible:ring-2 focus-visible:ring-brand ${arrastrando ? 'cursor-grabbing' : 'cursor-crosshair'}`}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={points} margin={margin}>
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
            <XAxis dataKey="t" type="number" scale="time" domain={[v.from, v.to]} allowDataOverflow tickFormatter={tickFormatter}
              tick={{ fontSize: 10, fill: c.axis }} axisLine={false} tickLine={false} tickCount={6} minTickGap={32} />
            <YAxis domain={['auto', 'auto']} tickFormatter={(n: number) => axisPrice(n, currency)} orientation="left"
              tick={{ fontSize: 10, fill: c.axis }} axisLine={false} tickLine={false} width={INSET.left} />
            {hasAvg && (
              <ReferenceLine y={avgPrice} stroke={c.axis} strokeDasharray="4 4" ifOverflow="extendDomain"
                label={{ value: `Precio medio ${formatPrice(avgPrice, currency)}`, position: 'insideBottomLeft', fill: c.axis, fontSize: 10 }} />
            )}
            <Tooltip content={<PriceTooltip currency={currency} />} cursor={{ stroke: c.cursorLine, strokeDasharray: '4 4' }}
              isAnimationActive={false} />
            <Area type="monotone" dataKey="price" baseValue={hasAvg ? avgPrice : 'dataMin'}
              stroke={stroke} strokeWidth={2} fill={hasAvg ? `url(#${id}-fill)` : 'none'} dot={false}
              activeDot={{ r: 3.5, strokeWidth: 0 }} isAnimationActive={!reduceMotion && !arrastrando} animationDuration={300} />
            {stats && (
              <>
                <ReferenceDot x={stats.max.t} y={stats.max.price} r={0}
                  label={{ value: `Máx. ${formatPrice(stats.max.price, currency)}`, position: SIDE_POSITION.top[labelSide(stats.max.t, v.from, v.to)], fill: c.axis, fontSize: 10 }} />
                <ReferenceDot x={stats.min.t} y={stats.min.price} r={0}
                  label={{ value: `Mín. ${formatPrice(stats.min.price, currency)}`, position: SIDE_POSITION.bottom[labelSide(stats.min.t, v.from, v.to)], fill: c.axis, fontSize: 10 }} />
              </>
            )}
            {marcas === 'puntos' && markers.map(m => (
              <ReferenceDot key={`${m.kind}-${m.t}`} x={m.t} y={m.price} ifOverflow="extendDomain"
                shape={(p: { cx?: number; cy?: number }) => (
                  <MarkerDot cx={p.cx} cy={p.cy} marker={m} color={m.kind === 'venta' ? c.down : c.up} label={etiqueta(m)}
                    highlighted={m.kind === 'venta' && m.day === highlightDay} />
                )} />
            ))}
            {marcas !== 'puntos' && (
              <Customized component={<MarcasBanderas markers={markers} lado={marcas === 'banderas-arriba' ? 'arriba' : 'abajo'}
                colorCompra={c.up} colorVenta={c.down} resaltadoDia={highlightDay} etiqueta={etiqueta} />} />
            )}
            {/* Precio en vivo: el último punto late (sin animación con «reducir movimiento»). */}
            {liveVisible && (
              <ReferenceDot x={last.t} y={last.price} ifOverflow="visible"
                shape={<LiveDot color={!hasAvg ? 'var(--cf-brand)' : last.price >= avgPrice ? c.up : c.down} />} />
            )}
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <NavegadorPrecio points={overview} extent={extent} v={v} onChange={setVentana} color={c.axis} />
      <Leyenda markers={markers} hasAvg={hasAvg} live={liveVisible} marcas={marcas} />
      <p className="text-[11px] text-fg-subtle">Rueda para acercar o alejar, arrastra para desplazarte y doble clic para volver a la vista inicial.</p>
    </div>
  )
}
