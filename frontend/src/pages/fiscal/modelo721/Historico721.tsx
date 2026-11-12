import { useId } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine, Cell } from 'recharts'
import { useChartColors } from '../../../hooks/useChartColors'
import { useReducedMotion } from '../../../hooks/useReducedMotion'
import { formatEur, formatMoneyCompact } from '../../../utils/format'
import { escalaRedonda } from '../../../utils/modelo721View'
import type { Historico721 as Fila } from '../types'

// Histórico del 721 (#545): cada 31 de diciembre, tu cartera en barras
// apiladas: abajo lo que computa (exchanges fuera de España), en medio lo que
// está en exchanges en España y arriba la autocustodia, que no computan. La
// línea del umbral solo afecta a lo de abajo.
// El año que se está viendo, resaltado; los demás, atenuados. El párrafo, el
// tooltip y la tabla dicen lo mismo en texto.

function TooltipAnio({ active, payload, umbral }: { active?: boolean; payload?: { payload: Fila }[]; umbral: number }) {
  if (!active || !payload?.[0]) return null
  const f = payload[0].payload
  const min = f.incompleto ? 'al menos ' : ''
  return (
    <div className="glass-tooltip rounded-xl px-3 py-2 text-xs space-y-0.5 tabular-nums">
      <p className="text-fg-muted mb-1">{f.estimado ? `${f.ejercicio}, a hoy (estimado)` : `31 de diciembre de ${f.ejercicio}`}</p>
      <p className="flex justify-between gap-4"><span className="text-fg-subtle">Fuera de España (computa)</span><span className="mono text-fg">{min}{formatEur(f.valorEur)}</span></p>
      <p className="flex justify-between gap-4"><span className="text-fg-subtle">En exchanges en España (no computa)</span><span className="mono text-fg-muted">{formatEur(f.noComputaEur)}</span></p>
      <p className="flex justify-between gap-4"><span className="text-fg-subtle">En autocustodia (no computa)</span><span className="mono text-fg-muted">{formatEur(f.autocustodiaEur)}</span></p>
      <p className="text-fg-subtle">{f.valorEur > umbral ? 'Supera el umbral' : 'No supera el umbral'}{f.presentado ? ', presentado' : ''}</p>
    </div>
  )
}

/** Año del eje X; el que se está viendo, en negrita y más contrastado. recharts añade x, y y payload. */
function TickAnio({ x, y, payload, activeYear, colores }: {
  x?: number; y?: number; payload?: { value: number }; activeYear: number; colores: { activo: string; resto: string }
}) {
  const activo = payload?.value === activeYear
  return (
    <text x={x} y={(y ?? 0) + 12} textAnchor="middle" fontSize={11} fontWeight={activo ? 700 : 400} fill={activo ? colores.activo : colores.resto}>
      {payload?.value}
    </text>
  )
}

export function Historico721({ historico, umbral, activeYear }: { historico: readonly Fila[]; umbral: number; activeYear: number }) {
  const c = useChartColors()
  const reduceMotion = useReducedMotion()
  const uid = useId()
  if (historico.length < 2) return null
  const total = (f: Fila) => f.valorEur + f.noComputaEur + f.autocustodiaEur
  const conValor = historico.some(f => total(f) > 0)
  const { top, ticks } = escalaRedonda(Math.max(...historico.map(total)), umbral)
  const presentados = historico.filter(f => f.presentado).map(f => f.ejercicio)
  const enCurso = historico.find(f => f.estimado)?.ejercicio
  const opacidad = (f: Fila) => (f.ejercicio === activeYear ? 1 : 0.45)

  return (
    <figure aria-labelledby={`${uid}-t`} className="relative space-y-2">
      <figcaption id={`${uid}-t`} className="text-xs font-medium text-fg-muted">Tu cartera a 31 de diciembre de cada ejercicio</figcaption>
      {!conValor ? (
        <p className="text-xs text-fg-subtle">Ningún año tienes monedas a 31 de diciembre.</p>
      ) : (
        <>
          <p className="text-[11px] text-fg-subtle">
            Abajo, lo que está en exchanges fuera de España y computa; en medio, lo que está en exchanges en España; arriba, la autocustodia. Estas dos no computan. La línea discontinua marca el umbral
            de {formatEur(umbral)}, que solo cuenta para lo de abajo. Resaltado, {activeYear}.
            {enCurso !== undefined ? ` ${enCurso}, valor a hoy.` : ''}
            {presentados.length > 0 ? ` Con borde, presentado (${presentados.join(', ')}).` : ''}
          </p>
          <div className="h-44" aria-hidden="true">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={[...historico]} margin={{ top: 18, right: 12, left: 0, bottom: 0 }} barCategoryGap="28%">
                <CartesianGrid vertical={false} stroke={c.grid} />
                <XAxis dataKey="ejercicio" tick={<TickAnio activeYear={activeYear} colores={{ activo: c.tooltipLabel, resto: c.axisMuted }} />}
                  axisLine={false} tickLine={false} interval={0} />
                <YAxis ticks={ticks} domain={[0, top]} tickFormatter={(v: number) => formatMoneyCompact(v, 'EUR')}
                  tick={{ fill: c.axisMuted, fontSize: 11 }} axisLine={false} tickLine={false} width={56} />
                <Tooltip cursor={{ fill: c.cursorSoft }} content={<TooltipAnio umbral={umbral} />} />
                <Bar dataKey="valorEur" stackId="v" isAnimationActive={!reduceMotion} maxBarSize={44}>
                  {historico.map(f => (
                    <Cell key={f.ejercicio} fill={f.valorEur > umbral ? c.loss : c.brand} fillOpacity={opacidad(f)}
                      stroke={f.presentado ? c.gain : undefined} strokeWidth={f.presentado ? 2 : 0} />
                  ))}
                </Bar>
                <Bar dataKey="noComputaEur" stackId="v" isAnimationActive={!reduceMotion} maxBarSize={44}>
                  {historico.map(f => <Cell key={f.ejercicio} fill={c.neutral} fillOpacity={opacidad(f) * 0.7} />)}
                </Bar>
                <Bar dataKey="autocustodiaEur" stackId="v" isAnimationActive={!reduceMotion} maxBarSize={44} radius={[3, 3, 0, 0]}>
                  {historico.map(f => <Cell key={f.ejercicio} fill={c.purple} fillOpacity={opacidad(f) * 0.7} />)}
                </Bar>
                {/* Después de las barras, para que la línea quede encima. */}
                <ReferenceLine y={umbral} stroke={c.warn} strokeWidth={2} strokeDasharray="6 4"
                  label={{ value: `Umbral ${formatMoneyCompact(umbral, 'EUR')}`, position: 'insideTopRight', fill: c.warn, fontSize: 11, fontWeight: 600 }} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
      <table className="sr-only">
        <caption>Cartera por custodia para el Modelo 721 por ejercicio</caption>
        <thead><tr><th scope="col">Ejercicio</th><th scope="col">Fuera de España (computa)</th><th scope="col">En exchanges en España (no computa)</th><th scope="col">En autocustodia (no computa)</th><th scope="col">Umbral</th><th scope="col">Presentado</th></tr></thead>
        <tbody>
          {historico.map(f => (
            <tr key={f.ejercicio}>
              <th scope="row">{f.ejercicio}{f.estimado ? ' (a hoy)' : ''}</th>
              <td>{f.incompleto ? 'al menos ' : ''}{formatEur(f.valorEur)}</td>
              <td>{formatEur(f.noComputaEur)}</td>
              <td>{formatEur(f.autocustodiaEur)}</td>
              <td>{f.valorEur > umbral ? 'Lo supera' : 'No lo supera'}</td>
              <td>{f.presentado ? 'Sí' : 'No'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  )
}
