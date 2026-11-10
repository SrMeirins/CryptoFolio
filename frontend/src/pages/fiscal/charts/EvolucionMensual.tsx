import { useId, useState } from 'react'
import { TrendingUp } from 'lucide-react'
import { ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, CartesianGrid } from 'recharts'
import { formatEur, formatMoneyCompact, formatEurSigned } from '../../../utils/format'
import { dominiosAlineados, mensualSeries, resumenMensual, type MonthBar } from '../../../utils/fiscalCharts'
import { useChartColors } from '../../../hooks/useChartColors'
import { useReducedMotion } from '../../../hooks/useReducedMotion'
import { StatStrip, Switch, type StatStripCell } from '../../../components/ui'
import { FiscalChartCard } from '../FiscalChartCard'
import { AxisButtonTick } from './AxisButtonTick'
import type { MonthlyData } from '../types'

// Evolución mensual (#301, #539): ganancias hacia arriba y pérdidas hacia
// abajo en cada mes (eje izquierdo) y el acumulado en escalón con su propio
// eje (derecho). Un interruptor añade el acumulado del año anterior,
// punteado. Los meses que aún no han llegado se ven vacíos. Pulsar un mes
// abre sus operaciones. Debajo, la tira con el mejor y el peor mes.

const LONG = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const signed = formatEurSigned
// Marcas del eje: sin decimales salvo que el paso sea menor que 1 €.
const eje = (ticks: readonly number[]) => (v: number) => (Math.abs(ticks[1] - ticks[0]) < 1 ? formatEur(v) : formatMoneyCompact(v, 'EUR'))
const tono = (v: number) => (v > 0.005 ? 'text-positive' : v < -0.005 ? 'text-negative' : 'text-fg')

function MonthTooltip({ active, payload, comparar, anioPrevio }: { active?: boolean; payload?: { payload: MonthBar }[]; comparar: boolean; anioPrevio: number }) {
  if (!active || !payload?.[0]) return null
  const d = payload[0].payload
  if (d.futuro && !(comparar && d.acumuladoPrevio !== null)) return null
  return (
    <div className="glass-tooltip rounded-xl px-3 py-2 text-xs space-y-0.5 tabular-nums">
      <p className="text-fg-muted mb-1 capitalize">{LONG[d.mes - 1]}</p>
      {!d.futuro && <>
        <p className="flex justify-between gap-4"><span className="text-fg-subtle">Ganancias</span><span className="mono text-positive">+{formatEur(d.ganancias ?? 0)}</span></p>
        <p className="flex justify-between gap-4"><span className="text-fg-subtle">Pérdidas</span><span className="mono text-negative">{formatEur(d.perdidas ?? 0)}</span></p>
        <p className="flex justify-between gap-4"><span className="text-fg-subtle">Neto del mes</span><span className={`mono ${tono(d.neto ?? 0)}`}>{signed(d.neto ?? 0)}</span></p>
        <p className="flex justify-between gap-4 font-semibold"><span className="text-fg-subtle">Acumulado</span><span className="mono text-fg">{signed(d.acumulado ?? 0)}</span></p>
      </>}
      {comparar && d.acumuladoPrevio !== null && (
        <p className="flex justify-between gap-4"><span className="text-fg-subtle">Acumulado {anioPrevio}</span><span className="mono text-fg-muted">{signed(d.acumuladoPrevio)}</span></p>
      )}
      {!d.futuro && <p className="text-fg-subtle pt-1">Pulsa para ver sus operaciones</p>}
    </div>
  )
}

export function EvolucionMensual({ data, year, previo, frenteAnterior, onSelectMonth }: {
  data: MonthlyData
  year: number
  /** Meses del año anterior, si hay datos de ese año. */
  previo?: MonthlyData
  /** Diferencia del neto con el año anterior a la misma fecha (o año completo) y su etiqueta. */
  frenteAnterior?: { delta: number; label: string } | null
  onSelectMonth: (month: number) => void
}) {
  const c = useChartColors()
  const reduceMotion = useReducedMotion()
  const uid = useId()
  // Con poco ancho, la inicial del mes: los 12 nombres cortos se solapan (#301).
  const [narrow, setNarrow] = useState(false)
  const [comparar, setComparar] = useState(false)
  if (data.meses.length === 0) return null
  const hayPrevio = !!previo && previo.meses.length > 0
  const verPrevio = comparar && hayPrevio
  const series = mensualSeries(data.meses, hayPrevio ? previo.meses : undefined)
  const isFuture = (v: string | number) => series.find(s => s.label === v)?.futuro ?? true
  const select = (v: string | number) => { const m = series.find(s => s.label === v); if (m && !m.futuro) onSelectMonth(m.mes) }
  const r = resumenMensual(series)
  const anioPrevio = year - 1
  // El cero de los dos ejes a la misma altura: barras del mes y acumulado.
  const dom = dominiosAlineados(
    series.flatMap(s => [s.ganancias ?? 0, s.perdidas ?? 0]),
    series.flatMap(s => [s.acumulado ?? 0, ...(verPrevio ? [s.acumuladoPrevio ?? 0] : [])]),
  )

  const tira: StatStripCell[] = [
    ...(r.mejor ? [{ key: 'mejor', label: 'Mejor mes', value: <span className="capitalize">{LONG[r.mejor.mes - 1]}</span>, sub: <span className="mono">{signed(r.mejor.neto ?? 0)}</span> }] : []),
    ...(r.peor && r.peor !== r.mejor ? [{ key: 'peor', label: 'Peor mes', value: <span className="capitalize">{LONG[r.peor.mes - 1]}</span>, sub: <span className="mono">{signed(r.peor.neto ?? 0)}</span> }] : []),
    { key: 'conops', label: 'Con operaciones', value: <>{r.conOperaciones} <span className="text-fg-subtle font-normal">de {r.transcurridos} meses</span></> },
    ...(frenteAnterior ? [{ key: 'previo', label: `Frente a ${anioPrevio}`, value: frenteAnterior.delta, format: signed,
      sub: frenteAnterior.label === String(anioPrevio) ? 'año completo' : 'a la misma fecha',
      tone: frenteAnterior.delta > 0.005 ? 'positive' as const : frenteAnterior.delta < -0.005 ? 'negative' as const : undefined }] : []),
  ]

  return (
    <FiscalChartCard icon={TrendingUp} title="Evolución mensual"
      right={hayPrevio && (
        <span className="inline-flex items-center gap-2 text-xs text-fg-muted">
          <Switch id={`${uid}-comparar`} checked={comparar} onChange={setComparar} />
          <label htmlFor={`${uid}-comparar`} className="cursor-pointer">Comparar con {anioPrevio}</label>
        </span>
      )}>
      <div className="h-60" role="group" aria-label={`Ganancias y pérdidas por mes y acumulado de ${year}: ${series.filter(s => !s.futuro).map(s => `${LONG[s.mes - 1]} ${signed(s.neto ?? 0)}`).join(', ')}`}>
        <ResponsiveContainer width="100%" height="100%" onResize={(w: number) => setNarrow(w < 480)}>
          <ComposedChart data={series} stackOffset="sign" margin={{ top: 10, right: 4, left: 0, bottom: 4 }}
            onClick={(s: { activePayload?: { payload: MonthBar }[] }) => { const m = s?.activePayload?.[0]?.payload; if (m && !m.futuro) onSelectMonth(m.mes) }}>
            <CartesianGrid vertical={false} stroke={c.grid} />
            <XAxis dataKey="label" axisLine={false} tickLine={false} interval={0} height={28}
              tick={<AxisButtonTick label={v => (narrow ? String(v).charAt(0).toUpperCase() : String(v))} describe={v => `Ver las operaciones de ${LONG[series.findIndex(s => s.label === v)]}`}
                onActivate={select} disabled={isFuture} fill={c.axisMuted} activeFill={c.axis} />} />
            <YAxis yAxisId="mes" domain={dom.a.domain} ticks={dom.a.ticks} tickFormatter={eje(dom.a.ticks)} tick={{ fontSize: 10, fill: c.axis }} axisLine={false} tickLine={false} width={58} />
            <YAxis yAxisId="acum" orientation="right" domain={dom.b.domain} ticks={dom.b.ticks} tickFormatter={eje(dom.b.ticks)} tick={{ fontSize: 10, fill: 'var(--cf-brand-ink)' }} axisLine={false} tickLine={false} width={58} />
            <ReferenceLine yAxisId="mes" y={0} stroke={c.gridStrong} />
            <Tooltip content={<MonthTooltip comparar={verPrevio} anioPrevio={anioPrevio} />} cursor={{ fill: c.cursorSoft }} />
            <Bar yAxisId="mes" dataKey="ganancias" stackId="gp" maxBarSize={20} radius={[3, 3, 0, 0]} fill={c.gain} fillOpacity={0.8} isAnimationActive={!reduceMotion} cursor="pointer" />
            <Bar yAxisId="mes" dataKey="perdidas" stackId="gp" maxBarSize={20} radius={[3, 3, 0, 0]} fill={c.loss} fillOpacity={0.8} isAnimationActive={!reduceMotion} cursor="pointer" />
            {verPrevio && (
              <Line yAxisId="acum" dataKey="acumuladoPrevio" type="stepAfter" stroke={c.axis} strokeWidth={1.5} strokeDasharray="4 3"
                dot={false} activeDot={false} isAnimationActive={false} />
            )}
            <Line yAxisId="acum" dataKey="acumulado" type="stepAfter" stroke="var(--cf-brand)" strokeWidth={2} dot={false}
              connectNulls={false} isAnimationActive={!reduceMotion} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <p className="flex items-center gap-4 flex-wrap text-[11px] text-fg-subtle mt-2">
        <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-positive/80" aria-hidden="true" />Ganancias (arriba)</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-negative/80" aria-hidden="true" />Pérdidas (abajo)</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-4 h-0.5 bg-brand" aria-hidden="true" />Acumulado (eje derecho)</span>
        {verPrevio && <span className="inline-flex items-center gap-1.5"><span className="w-4 border-t-2 border-dashed border-fg-muted" aria-hidden="true" />Acumulado {anioPrevio}</span>}
      </p>
      <StatStrip label={`Resumen mensual de ${year}`} cells={tira} columnas={2} className="mt-4" />
    </FiscalChartCard>
  )
}
