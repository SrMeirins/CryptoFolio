import { useId, useMemo, useState } from 'react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ReferenceArea, ReferenceDot, ReferenceLine,
  ResponsiveContainer, Customized,
} from 'recharts'
import { formatMoney, formatMoneyCompact, formatPercent, type Currency } from '../../../utils/format'
import { flowBuckets } from '../../../utils/evolutionSummary'
import { formatPointDateShort } from '../../../utils/evolutionSeries'
import { tramosSinPosiciones, type PuntoVentana } from '../../../utils/evolucionVentana'
import { formatTick, niceTicks, tickDecimals, timeAxis } from '../../../utils/chartAxes'
import { zeroSplit } from '../../../utils/zeroSplit'
import { useChartColors } from '../../../hooks/useChartColors'
import { useReducedMotion } from '../../../hooks/useReducedMotion'
import { useTransientFlag } from '../../../hooks/useTransientFlag'
import { EvolutionTooltip } from '../EvolutionTooltip'
import { LiveDot } from '../LiveDot'
import { FlowMarkerLayer, FlowMarkerTooltip, type ActiveMarker } from '../FlowMarkers'
import { CruzExchange, EtiquetaUltimo } from './CruzExchange'

// Gráfico de evolución (#509), común a las pestañas P&L (en % o en euros) y
// Valor: curva con degradado del color del resultado, cruz de exchange con
// el valor y la fecha en los ejes, etiqueta del último valor, depósitos y
// retiradas, punto en vivo y periodos sin posiciones sombreados (sin curva).
// En Valor, la línea discontinua del capital neto aportado y la ganancia o
// pérdida sombreada entre ambas. Los puntos ya vienen recortados a la ventana
// del zoom; el gráfico solo los pinta.

export type ModoEvolucion = 'pct' | 'pnl' | 'value'

/** Fila del gráfico: el valor de la serie es null en los días sin posiciones (sin curva). */
type Fila = PuntoVentana & { serie: number | null; gana: [number, number] | null; pierde: [number, number] | null }

export function GraficoEvolucion({ puntos, modo, currency, intraday, animationKey, conAportado = true }: {
  puntos: readonly PuntoVentana[]
  modo: ModoEvolucion
  currency: Currency
  intraday: boolean
  animationKey: string
  /** En Valor, la línea del capital aportado (se puede ocultar desde la leyenda). */
  conAportado?: boolean
}) {
  const c = useChartColors()
  const reduceMotion = useReducedMotion()
  const animating = useTransientFlag(animationKey, 900)
  const id = useId().replace(/:/g, '')
  const [hover, setHover] = useState<number | null>(null)
  const [activeMarker, setActiveMarker] = useState<ActiveMarker | null>(null)
  const key: 'pct' | 'pnl' | 'value' = modo

  const filas: Fila[] = useMemo(() => puntos.map(p => {
    const v = p.vacio ? null : p[key]
    const aportado = modo === 'value' && conAportado && !p.vacio
    return {
      ...p,
      serie: v,
      gana: aportado && p.value >= p.aportado ? [p.aportado, p.value] : null,
      pierde: aportado && p.value < p.aportado ? [p.value, p.aportado] : null,
    }
  }), [puntos, key, modo, conAportado])

  const xAxis = useMemo(() => timeAxis(filas.map(p => p.x), intraday), [filas, intraday])
  const yTicks = useMemo(() => {
    const vals = filas.flatMap(p => (p.serie === null ? [] : modo === 'value' && conAportado ? [p.serie, p.aportado] : [p.serie]))
    return vals.length ? niceTicks(Math.min(...vals), Math.max(...vals), 5, modo !== 'value') : []
  }, [filas, modo, conAportado])
  const yDecimals = tickDecimals(yTicks)
  const split = useMemo(() => zeroSplit(filas.map(p => p.serie ?? 0)), [filas])
  const buckets = useMemo(() => flowBuckets(puntos as PuntoVentana[], intraday), [puntos, intraday])
  const huecos = useMemo(() => tramosSinPosiciones(puntos), [puntos])

  const last = [...filas].reverse().find(p => p.serie !== null)
  // En Valor, el color dice si la cartera vale más que lo aportado (ganancia) o menos.
  const positivo = modo === 'value' ? (last?.value ?? 0) >= (last?.aportado ?? 0) : (last?.serie ?? 0) >= 0
  const color = positivo ? c.up : c.down
  const fmt = (v: number, dec = 2) => (modo === 'pct' ? formatPercent(v, dec, true) : dec === 0 ? formatMoneyCompact(v, currency) : formatMoney(v, currency))
  const fmtEje = (v: number) => (modo === 'pct' ? formatPercent(v, yDecimals) : yDecimals === 0 ? formatMoneyCompact(v, currency) : formatMoney(v, currency))
  const punto = hover !== null ? filas[hover] : null
  const anchoEje = modo === 'pct' ? 56 : 80

  return (
    <>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={filas} margin={{ top: 12, right: 76, left: 0, bottom: 4 }}
          onMouseMove={(s: { activeTooltipIndex?: number }) => setHover(typeof s?.activeTooltipIndex === 'number' ? s.activeTooltipIndex : null)}
          onMouseLeave={() => setHover(null)}>
          <defs>
            <linearGradient id={`${id}-fill`} x1="0" y1="0" x2="0" y2="1">
              {modo === 'value'
                ? <><stop offset="0%" stopColor={color} stopOpacity={0.32} /><stop offset="100%" stopColor={color} stopOpacity={0.02} /></>
                : <>
                    <stop offset={0} stopColor={c.up} stopOpacity={0.34} />
                    <stop offset={split.fill} stopColor={c.up} stopOpacity={0.04} />
                    <stop offset={split.fill} stopColor={c.down} stopOpacity={0.04} />
                    <stop offset={1} stopColor={c.down} stopOpacity={0.34} />
                  </>}
            </linearGradient>
            <linearGradient id={`${id}-stroke`} x1="0" y1="0" x2="0" y2="1">
              <stop offset={split.stroke ?? 0} stopColor={c.up} />
              <stop offset={split.stroke ?? 0} stopColor={c.down} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke={c.grid} strokeOpacity={0.6} />
          <XAxis dataKey="x" type="number" scale="time" domain={xAxis.domain} ticks={xAxis.ticks} interval={0}
            tickFormatter={(x: number) => formatTick(x, xAxis.unit)} tick={{ fontSize: 11, fill: c.axis }}
            axisLine={false} tickLine={false} tickMargin={8} allowDataOverflow />
          <YAxis domain={[yTicks[0], yTicks[yTicks.length - 1]]} ticks={yTicks} interval={0} tickFormatter={fmtEje}
            tick={{ fontSize: 11, fill: c.axis }} axisLine={false} tickLine={false} width={anchoEje} />
          {modo !== 'value' && <ReferenceLine y={0} stroke={c.axis} strokeOpacity={0.6} />}
          {/* Periodos sin posiciones: sombreados y sin curva. */}
          {huecos.map(h => (
            <ReferenceArea key={`${h.from}`} x1={h.from} x2={h.to === h.from ? h.to + (intraday ? 900_000 : 86_400_000) : h.to}
              fill={c.neutral} fillOpacity={0.12} stroke="none" ifOverflow="hidden"
              label={{ value: 'Sin posiciones', position: 'insideTop', fill: c.axis, fontSize: 10 }} />
          ))}
          <RechartsTooltip active={activeMarker ? false : undefined} cursor={false}
            content={<EvolutionTooltip currency={currency} intraday={intraday} primary={modo} />} />
          {modo === 'value' && conAportado && (
            <>
              <Area type="monotone" dataKey="gana" stroke="none" fill={c.up} fillOpacity={0.1} isAnimationActive={false} connectNulls={false} />
              <Area type="monotone" dataKey="pierde" stroke="none" fill={c.down} fillOpacity={0.12} isAnimationActive={false} connectNulls={false} />
              <Area type="stepAfter" dataKey={(p: Fila) => (p.vacio ? null : p.aportado)} stroke={c.axis} strokeWidth={1.5}
                strokeDasharray="5 4" fill="none" dot={false} activeDot={false} isAnimationActive={false} name="Aportado" />
            </>
          )}
          <Area type="monotone" dataKey="serie" baseValue={modo === 'value' ? 'dataMin' : 0} connectNulls={false}
            stroke={modo === 'value' ? color : split.stroke === null ? (split.solid === 'up' ? c.up : c.down) : `url(#${id}-stroke)`}
            strokeWidth={2} fill={`url(#${id}-fill)`} dot={false} activeDot={{ r: 4, fill: color, strokeWidth: 0 }}
            isAnimationActive={!reduceMotion && animating} animationDuration={600} animationEasing="ease-in-out" />
          <Customized component={
            <FlowMarkerLayer buckets={buckets} yKey={key} active={activeMarker} onActivate={setActiveMarker}
              colors={{ up: c.up, down: c.down, ring: c.axis, bg: c.tooltipBg }} intraday={intraday} currency={currency} />
          } />
          {last?.live && last.serie !== null && (
            <ReferenceDot x={last.x} y={last.serie} ifOverflow="visible" shape={<LiveDot color={color} />} />
          )}
          <Customized component={<EtiquetaUltimo x={last?.x ?? null} y={last?.serie ?? null} texto={last?.serie != null ? fmt(last.serie) : ''} color={color} />} />
          <Customized component={
            <CruzExchange x={punto?.serie != null ? punto.x : null} y={punto?.serie ?? null}
              textoY={punto?.serie != null ? fmt(punto.serie) : ''} textoX={punto ? formatPointDateShort(punto.x, intraday) : ''}
              colores={{ linea: c.cursor, fondo: c.gridStrong, texto: c.tooltipLabel }} />
          } />
        </AreaChart>
      </ResponsiveContainer>
      <FlowMarkerTooltip marker={activeMarker} intraday={intraday} currency={currency} />
    </>
  )
}
