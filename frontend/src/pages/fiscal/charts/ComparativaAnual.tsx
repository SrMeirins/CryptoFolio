import { useState } from 'react'
import { TrendingUp } from 'lucide-react'
import { formatEur, formatNumber } from '../../../utils/format'
import { ETIQUETAS_TIRA, filasComparativa, maxEscala, pctEscala, resumenComparativa, type FilaAnual, type MetricaAnual } from '../../../utils/comparativaFiscal'
import { SegmentedControl, StatStrip, type StatStripCell } from '../../../components/ui'
import { FiscalChartCard } from '../FiscalChartCard'
import type { YearOverview } from '../types'

// Comparativa interanual (#301, #539): una fila por año con barra divergente
// (pérdidas a la izquierda, ganancias a la derecha) o, en Cuota y
// Operaciones, una barra desde cero. El año en curso va rayado como
// provisional. Cada fila abre las operaciones de ese año. Debajo, la tira con
// el mejor y el peor año según la métrica.

const signed = (v: number) => `${v >= 0 ? '+' : ''}${formatEur(v)}`
const METRICAS = [
  { value: 'resultado' as const, label: 'Resultado' },
  { value: 'cuota' as const, label: 'Cuota' },
  { value: 'operaciones' as const, label: 'Operaciones' },
]
const formato = (m: MetricaAnual) => (m === 'resultado' ? signed : m === 'cuota' ? formatEur : (v: number) => formatNumber(v, 0))
// Rayado del año provisional: el color de la barra con franjas diagonales.
const RAYADO = { backgroundImage: 'repeating-linear-gradient(135deg, transparent 0 4px, rgb(0 0 0 / 0.28) 4px 7px)' }

function Barra({ f, metrica, max }: { f: FilaAnual; metrica: MetricaAnual; max: number }) {
  const prov = f.enCurso ? RAYADO : undefined
  if (metrica !== 'resultado') {
    return (
      <div className="relative h-3 rounded-sm bg-overlay/5">
        <div className={`absolute inset-y-0 left-0 rounded-sm ${metrica === 'cuota' ? 'bg-warning/80' : 'bg-brand/75'}`}
          style={{ width: `${pctEscala(f.valor, max)}%`, ...prov }} />
      </div>
    )
  }
  return (
    <div className="relative h-3 grid grid-cols-2 gap-px">
      <div className="relative rounded-l-sm bg-overlay/5">
        <div className="absolute inset-y-0 right-0 rounded-l-sm bg-negative/80" style={{ width: `${pctEscala(f.perdidas, max)}%`, ...prov }} />
      </div>
      <div className="relative rounded-r-sm bg-overlay/5">
        <div className="absolute inset-y-0 left-0 rounded-r-sm bg-positive/80" style={{ width: `${pctEscala(f.ganancias, max)}%`, ...prov }} />
      </div>
    </div>
  )
}

export function ComparativaAnual({ data, activeYear, onOpenYear }: {
  data: YearOverview[]
  activeYear: number
  /** Abre Operaciones con las del año pulsado. */
  onOpenYear: (year: number) => void
}) {
  const [metrica, setMetrica] = useState<MetricaAnual>('resultado')
  if (data.length < 2) return null
  const filas = filasComparativa(data, metrica)
  const max = maxEscala(filas, metrica)
  const fmt = formato(metrica)
  const r = resumenComparativa(filas)
  const et = ETIQUETAS_TIRA[metrica]
  const provisional = (f: FilaAnual) => (f.enCurso ? ' (en curso)' : '')
  const tira: StatStripCell[] = r ? [
    { key: 'mejor', label: et.mejor, value: <>{r.mejor.year}</>, sub: <span className="mono">{fmt(r.mejor.valor)}{provisional(r.mejor)}</span> },
    { key: 'peor', label: et.peor, value: <>{r.peor.year}</>, sub: <span className="mono">{fmt(r.peor.valor)}{provisional(r.peor)}</span> },
    { key: 'media', label: et.media, value: r.media, format: fmt },
  ] : []

  return (
    <FiscalChartCard icon={TrendingUp} title="Comparativa interanual"
      right={<SegmentedControl options={METRICAS} value={metrica} onChange={setMetrica} label="Métrica de la comparativa" size="sm" />}>
      {metrica === 'resultado' && (
        <div className="grid grid-cols-[3.5rem_1fr_7.5rem] gap-3 mb-1.5 text-[10.5px] uppercase tracking-widest text-fg-subtle" aria-hidden="true">
          <span />
          <span className="grid grid-cols-2"><span className="text-right pr-2">Pérdidas</span><span className="pl-2">Ganancias</span></span>
          <span className="text-right">Neto</span>
        </div>
      )}
      <ul className="space-y-1">
        {filas.map(f => {
          const activo = f.year === activeYear
          const detalle = metrica === 'resultado'
            ? `ganancias ${formatEur(f.ganancias)}, pérdidas ${formatEur(f.perdidas)}, neto ${signed(f.neto)}`
            : `${METRICAS.find(m => m.value === metrica)!.label.toLowerCase()} ${fmt(f.valor)}`
          return (
            <li key={f.year}>
              <button type="button" onClick={() => onOpenYear(f.year)}
                aria-label={`${f.year}${f.enCurso ? ', en curso, provisional' : ''}: ${detalle}. Ver sus operaciones`}
                className={`w-full grid grid-cols-[3.5rem_1fr_7.5rem] items-center gap-3 rounded-lg px-2 py-2 -mx-2 text-left transition-colors hover:bg-overlay/[0.06] focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand ${activo ? 'bg-brand/8' : ''}`}>
                <span className="flex flex-col leading-tight">
                  <span className={`mono text-sm ${activo ? 'font-bold text-fg' : 'text-fg-muted'}`}>{f.year}</span>
                  {f.enCurso && <span className="text-[10px] text-fg-subtle">provisional</span>}
                </span>
                <Barra f={f} metrica={metrica} max={max} />
                <span className={`text-right mono tabular-nums text-sm ${metrica === 'resultado' ? (f.neto > 0.005 ? 'text-positive' : f.neto < -0.005 ? 'text-negative' : 'text-fg-muted') : 'text-fg'} ${activo ? 'font-semibold' : ''}`}>
                  {fmt(f.valor)}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
      <p className="flex items-center gap-4 flex-wrap text-[11px] text-fg-subtle mt-3">
        {metrica === 'resultado' && <>
          <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-negative/80" aria-hidden="true" />Pérdidas (izquierda)</span>
          <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-positive/80" aria-hidden="true" />Ganancias (derecha)</span>
        </>}
        {filas.some(f => f.enCurso) && <span className="inline-flex items-center gap-1.5"><span className="w-3 h-2.5 rounded-sm bg-fg-subtle/60" style={RAYADO} aria-hidden="true" />Rayado: año en curso, provisional</span>}
        <span>Pulsa un año para ver sus operaciones.</span>
      </p>
      {tira.length > 0 && <StatStrip label={`Resumen de la comparativa por ${METRICAS.find(m => m.value === metrica)!.label.toLowerCase()}`} cells={tira} className="mt-4" />}
    </FiscalChartCard>
  )
}
