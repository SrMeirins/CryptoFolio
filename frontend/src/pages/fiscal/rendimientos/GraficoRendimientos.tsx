import { useId } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { formatEur, formatMoneyCompact } from '../../../utils/format'
import { useChartColors } from '../../../hooks/useChartColors'
import { useReducedMotion } from '../../../hooks/useReducedMotion'
import { colorTipo, serieMensual, TIPOS, type FilaSerie, type ResumenTipo } from '../../../utils/rendimientos'
import type { RendimientoEvent } from '../types'

// Rendimientos por mes (#544): barras apiladas por tipo. La leyenda dice el
// nombre y el total de cada tipo (el color solo refuerza) y, para lectores de
// pantalla, una tabla con lo mismo.

function TooltipMes({ active, payload, presentes }: { active?: boolean; payload?: { payload: FilaSerie }[]; presentes: readonly ResumenTipo[] }) {
  if (!active || !payload?.[0]) return null
  const f = payload[0].payload
  const total = presentes.reduce((s, t) => s + f[t.clave], 0)
  if (total <= 0) return null
  return (
    <div className="glass-tooltip rounded-xl px-3 py-2 text-xs space-y-0.5 tabular-nums">
      <p className="text-fg-muted mb-1 capitalize">{f.label}</p>
      {presentes.filter(t => f[t.clave] > 0).map(t => (
        <p key={t.clave} className="flex justify-between gap-4"><span className="text-fg-subtle">{t.label}</span><span className="mono text-fg">{formatEur(f[t.clave])}</span></p>
      ))}
      <p className="flex justify-between gap-4 font-semibold pt-0.5"><span className="text-fg-subtle">Total del mes</span><span className="mono text-fg">{formatEur(total)}</span></p>
    </div>
  )
}

export function GraficoRendimientos({ rendimientos, presentes }: { rendimientos: readonly RendimientoEvent[]; presentes: readonly ResumenTipo[] }) {
  const c = useChartColors()
  const reduceMotion = useReducedMotion()
  const uid = useId()
  const serie = serieMensual(rendimientos)
  const claves = TIPOS.filter(t => presentes.some(p => p.clave === t.clave)).map(t => t.clave)
  return (
    <figure aria-labelledby={`${uid}-t`} className="relative space-y-2">
      <figcaption id={`${uid}-t`} className="text-xs font-medium text-fg-muted">Rendimientos por mes y tipo</figcaption>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-fg-muted" aria-label="Leyenda">
        {presentes.map(t => (
          <li key={t.clave} className="inline-flex items-center gap-1.5">
            <span aria-hidden="true" className="inline-block size-2.5 rounded-sm" style={{ background: colorTipo(c, t.clave) }} />
            {t.label} <span className="mono text-fg">{formatEur(t.total)}</span>
          </li>
        ))}
      </ul>
      <div className="h-44" aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={serie} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke={c.grid} />
            <XAxis dataKey="label" tickFormatter={(v: string) => v.slice(0, 3)} tick={{ fill: c.axisMuted, fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tickFormatter={(v: number) => formatMoneyCompact(v, 'EUR')} tick={{ fill: c.axisMuted, fontSize: 11 }} axisLine={false} tickLine={false} width={56} />
            <Tooltip cursor={{ fill: c.cursorSoft }} content={<TooltipMes presentes={presentes} />} />
            {claves.map((k, i) => (
              <Bar key={k} dataKey={k} stackId="r" fill={colorTipo(c, k)} isAnimationActive={!reduceMotion}
                radius={i === claves.length - 1 ? [3, 3, 0, 0] : [0, 0, 0, 0]} maxBarSize={28} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
      <table className="sr-only">
        <caption>Rendimientos por mes y tipo</caption>
        <thead><tr><th scope="col">Mes</th>{presentes.map(t => <th key={t.clave} scope="col">{t.label}</th>)}</tr></thead>
        <tbody>
          {serie.filter(f => claves.some(k => f[k] > 0)).map(f => (
            <tr key={f.mes}><th scope="row">{f.label}</th>{presentes.map(t => <td key={t.clave}>{formatEur(f[t.clave])}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </figure>
  )
}
