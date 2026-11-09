import { useId, useState } from 'react'
import { Calculator, CheckCircle2, ChevronDown } from 'lucide-react'
import { AnimatedNumber } from '../../components/AnimatedNumber'
import { Notice, panelClasses, panelEnterStyle, panelSurface, Skeleton } from '../../components/ui'
import { formatEur, formatPercent, pnlColor } from '../../utils/format'
import type { YearComparison } from '../../utils/fiscalHeader'
import { avanceAnio, cascadaCuota, type PasoCascada } from '../../utils/cascadaCuota'
import { textoPlazoRenta } from '../../utils/plazoRenta'
import { appToday } from '../../utils/datePresets'
import type { Tramo } from '../../utils/tramosIrpf'
import type { FiscalHito } from '../../api/portfolio'
import { CalculoTramos } from './TaxCards'
import type { CarryforwardDetalle, FiscalSummary } from './types'

// Bloque «Neto a declarar» del ejercicio (#297, #537): el neto y la cuota como
// protagonistas, el avance del año (o el plazo de la Renta si está cerrado),
// el aviso de pérdidas que caducan y la cascada «De dónde sale la cuota», con
// el cálculo por tramos desplegable dentro del propio bloque. Las cifras de
// ganancias, pérdidas, rendimientos y operaciones van en la tira de la cabecera.

// Un total negativo (neto en pérdidas) va en rojo; el resto, neutro.
const pnlColorTotal = (v: number) => (v < -0.005 ? 'text-negative' : 'text-fg')

const signed = (v: number) => `${v >= 0 ? '+' : ''}${formatEur(v)}`

function Delta({ value, label, invert = false }: { value: number; label: string; invert?: boolean }) {
  // En la cuota, pagar más es peor: el color se invierte.
  const tone = Math.abs(value) < 0.005 ? 'text-fg-subtle' : (value > 0) !== invert ? 'text-positive' : 'text-negative'
  return (
    <p className="text-xs text-fg-subtle mt-1">
      <span className={`mono font-medium ${tone}`}>{signed(value)}</span> vs {label}
    </p>
  )
}

export function FiscalHeroSkeleton() {
  return (
    <div className={panelClasses(panelSurface('none', 'rounded-2xl p-6 space-y-4'))}>
      <Skeleton className="h-3 w-40" />
      <Skeleton className="h-10 w-56" />
      <div className="space-y-2 pt-4">{[0, 1, 2, 3].map(i => <Skeleton key={i} className="h-4" />)}</div>
    </div>
  )
}

// Extracto (#537): operador en una ficha de color e importe del mismo tono. El
// color nunca va solo: lo acompañan el operador y, para el lector de pantalla,
// «suma» o «resta». El arrastre devuelve la pérdida neta fuera de la base, así
// que va en neutro aunque sume.
const OPERADOR: Record<PasoCascada['tipo'], string> = { suma: '+', resta: '-', total: '=' }
const OPERACION_SR: Record<PasoCascada['tipo'], string> = { suma: 'suma', resta: 'resta', total: 'total' }
const TONO: Record<'suma' | 'resta' | 'total' | 'neutro', { ficha: string; importe: string }> = {
  suma:   { ficha: 'bg-positive/12 text-positive-ink', importe: 'text-positive' },
  resta:  { ficha: 'bg-negative/12 text-negative-ink', importe: 'text-negative' },
  total:  { ficha: 'bg-brand/15 text-brand-ink', importe: 'text-fg' },
  neutro: { ficha: 'bg-overlay/10 text-fg-muted', importe: 'text-fg-muted' },
}
// Un movimiento de 0 € tampoco suma ni resta: neutro.
const tonoDe = (p: PasoCascada) => (p.key === 'arrastre' || (p.tipo !== 'total' && Math.abs(p.importe) < 0.005) ? TONO.neutro : TONO[p.tipo])

function Ficha({ children, className }: { children: React.ReactNode; className: string }) {
  return (
    <span aria-hidden="true" className={`inline-flex size-5 items-center justify-center rounded-md mono text-[13px] font-bold leading-none ${className}`}>
      {children}
    </span>
  )
}

function Avance({ esAnioEnCurso, declarada, plazoRenta, hoy }: {
  esAnioEnCurso: boolean; declarada: boolean; plazoRenta?: FiscalHito; hoy: string
}) {
  if (!esAnioEnCurso) {
    return (
      <p className="mt-3 flex items-center gap-1.5 text-xs text-fg-subtle">
        <CheckCircle2 size={12} aria-hidden="true" className="shrink-0" />
        Ejercicio cerrado · {declarada ? 'Renta declarada' : textoPlazoRenta(plazoRenta)}
      </p>
    )
  }
  const { dia, dias, pct } = avanceAnio(hoy)
  const texto = `Día ${dia} de ${dias}`
  return (
    <div className="mt-3 w-56 max-w-full">
      <div className="flex items-baseline justify-between gap-3 text-xs text-fg-subtle">
        <span>Cifras hasta hoy</span>
        <span className="mono tabular-nums">{texto}</span>
      </div>
      <div className="mt-1.5 h-1 rounded-full bg-overlay/10 overflow-hidden" role="progressbar" aria-label="Avance del ejercicio"
        aria-valuemin={1} aria-valuemax={dias} aria-valuenow={dia} aria-valuetext={texto}>
        <div className="h-full rounded-full bg-info" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

export function FiscalHero({ summary, cuota, tipoMedio, comparison, aviso, declarada = false, cf, tramos, plazoRenta, hoy = appToday() }: {
  summary: FiscalSummary
  cuota: number
  tipoMedio: number
  comparison: YearComparison | null
  /** Aviso destacado del año, p. ej. pérdidas que caducan (#305). */
  aviso?: React.ReactNode
  /** La Renta del ejercicio ya se marcó como declarada (#311). */
  declarada?: boolean
  /** Compensación de pérdidas del ejercicio, la misma de la que sale la cuota. */
  cf?: CarryforwardDetalle
  /** Escala del ejercicio (#452). */
  tramos: Tramo[]
  /** Hito de la Renta de este ejercicio en el calendario fiscal, si lo hay. */
  plazoRenta?: FiscalHito
  /** Hoy en la zona de la app (AAAA-MM-DD); se inyecta en los tests. */
  hoy?: string
}) {
  const uid = useId()
  const [tramosAbiertos, setTramosAbiertos] = useState(false)
  const neto = summary.netoPatrimonial
  const cascada = cascadaCuota({ ganancias: summary.totalGanancias, perdidas: summary.totalPerdidas, rendimientos: summary.totalRendimientos, cf })
  // Versión ligera de los paneles (#419): el brillo de la esquina toma el color del neto.
  const panel = neto > 0.005 ? 'var(--cf-positive)' : neto < -0.005 ? 'var(--cf-negative)' : 'var(--cf-fg-subtle)'
  return (
    <section aria-label={`Resultado fiscal de ${summary.year}`} style={{ ...panelEnterStyle(0), '--panel': panel } as React.CSSProperties}
      className={panelClasses(panelSurface('none', 'rounded-2xl p-6 space-y-5'))}>
      <div className="flex flex-wrap items-start justify-between gap-6">
        <div className="min-w-0">
          <h2 className="text-[11px] font-semibold uppercase tracking-widest text-fg-subtle">Neto a declarar {summary.year}</h2>
          <AnimatedNumber value={neto} format={signed} className={`block text-4xl font-bold mono tabular-nums mt-2 break-words ${pnlColor(neto)}`} />
          {comparison && <Delta value={comparison.netoDelta} label={comparison.label} />}
          <Avance esAnioEnCurso={summary.esAnioEnCurso} declarada={declarada} plazoRenta={plazoRenta} hoy={hoy} />
        </div>
        <div className="sm:text-right min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-fg-subtle">Cuota IRPF estimada</p>
          <AnimatedNumber value={cuota} format={formatEur} className="block text-4xl font-bold mono tabular-nums mt-2 text-fg break-words" />
          <p className="text-xs text-fg-subtle mt-1">
            {cuota > 0.005
              ? <>tipo medio <span className="mono text-fg-muted">{formatPercent(tipoMedio, 1)}</span> · tras compensar pérdidas</>
              : 'sin cuota: pérdidas o base nula'}
          </p>
          {comparison?.cuotaDelta != null && <Delta value={comparison.cuotaDelta} label={comparison.label} invert />}
        </div>
      </div>
      {aviso}
      <div className="pt-5 border-t border-border">
        <h3 id={`${uid}-cascada`} className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-fg-subtle">
          <span aria-hidden="true" className="inline-flex size-6 items-center justify-center rounded-lg bg-brand/12 text-brand-ink"><Calculator size={13} /></span>
          De dónde sale la cuota
        </h3>
        {/* Extracto (#537): operador, concepto con su nota e importe; subtotales en banda y la cuota como total del recibo. */}
        <table aria-labelledby={`${uid}-cascada`} className="w-full mt-4 text-sm border-separate border-spacing-y-1">
          <tbody>
            {cascada.pasos.map(p => {
              const total = p.tipo === 'total'
              const tono = tonoDe(p)
              const banda = total ? 'bg-overlay/5' : ''
              return (
                <tr key={p.key}>
                  <td className={`py-2 pl-2 pr-3 w-9 align-top rounded-l-lg ${banda}`}><Ficha className={tono.ficha}>{OPERADOR[p.tipo]}</Ficha></td>
                  <th scope="row" className={`py-2 pr-4 text-left align-top ${banda} ${total ? 'font-semibold text-fg' : 'font-normal text-fg-muted'}`}>
                    <span className="leading-5">{p.label}</span>
                    {p.nota && <span className="block mt-0.5 text-xs font-normal text-fg-subtle">{p.nota}</span>}
                  </th>
                  <td className={`py-2 pr-3 text-right mono tabular-nums whitespace-nowrap align-top leading-5 rounded-r-lg ${banda} ${total ? 'font-semibold' : ''} ${total ? pnlColorTotal(p.importe) : tono.importe}`}>
                    {total ? formatEur(p.importe) : <><span className="sr-only">{OPERACION_SR[p.tipo]} </span>{formatEur(Math.abs(p.importe))}</>}
                  </td>
                </tr>
              )
            })}
          </tbody>
          {/* Total del recibo: la cuota que sale de la base, la misma de arriba. */}
          <tfoot>
            <tr>
              <td className="py-3 pl-2 pr-3 w-9 align-top rounded-l-xl bg-brand/10 border-y border-l border-brand/25">
                <Ficha className="bg-brand-solid text-on-brand">=</Ficha>
              </td>
              <th scope="row" className="py-3 pr-4 text-left align-top font-semibold text-fg bg-brand/10 border-y border-brand/25">
                <span className="leading-5">Cuota estimada</span>
                <span className="block mt-0.5 text-xs font-normal text-fg-muted">
                  {cuota > 0.005 ? <>Escala del ahorro sobre la base; tipo medio <span className="mono">{formatPercent(tipoMedio, 1)}</span>.</> : 'Sin base positiva no hay cuota.'}
                </span>
              </th>
              <td className="py-3 pr-3 text-right align-top mono tabular-nums whitespace-nowrap text-lg font-bold leading-5 text-fg rounded-r-xl bg-brand/10 border-y border-r border-brand/25">
                {formatEur(cuota)}
              </td>
            </tr>
          </tfoot>
        </table>
        {/* Rentas de la base general (#537): no entran en la cuota del ahorro. */}
        {summary.totalBaseGeneral > 0.005 && (
          <Notice tipo="informacion" compact className="mt-3" title={<>Fuera de esta cuota: <span className="mono">{formatEur(summary.totalBaseGeneral)}</span> en la base general</>}>
            Airdrops, minería y cashback ({summary.numBaseGeneral} {summary.numBaseGeneral === 1 ? 'operación' : 'operaciones'}) son ganancias no derivadas de
            transmisión: tributan en la base general a tu tipo marginal, que depende del resto de tus ingresos, y no se compensan con estas pérdidas.
          </Notice>
        )}
        {cascada.base > 0 && (
          <>
            <button type="button" onClick={() => setTramosAbiertos(v => !v)} aria-expanded={tramosAbiertos} aria-controls={`${uid}-tramos`}
              className="mt-3 inline-flex items-center gap-1 min-h-6 text-xs text-fg-subtle hover:text-fg rounded-md px-1 -mx-1 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand/60">
              {tramosAbiertos ? 'Ocultar el cálculo por tramos' : 'Ver el cálculo por tramos'}
              <ChevronDown size={13} aria-hidden="true" className={`transition-transform ${tramosAbiertos ? 'rotate-180' : ''}`} />
            </button>
            {tramosAbiertos && <CalculoTramos id={`${uid}-tramos`} base={cascada.base} tramos={tramos} />}
          </>
        )}
      </div>
    </section>
  )
}
