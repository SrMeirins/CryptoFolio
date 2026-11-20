import type { ReactNode } from 'react'
import { Activity, CalendarRange, TrendingDown, TrendingUp, Waves } from 'lucide-react'
import { InfoTooltip } from '../../../components/InfoTooltip'
import type { TotalTramo } from '../../../utils/calendarioDietz'
import type { Riesgo } from '../../../utils/rendimiento'
import { DIAS_ANIO } from '../../../utils/rendimiento'
import { fechaCorta } from '../../../utils/rangoGrafico'
import { monthLabel } from '../../../utils/pnlCalendar'
import { formatPercent, type Currency } from '../../../utils/format'
import { signedMoney, signedPct } from '../calendar/format'

// Vista «Riesgo» del panel Rendimiento (#517): máxima caída desde máximos con
// sus fechas y su recuperación, caída actual, volatilidad anualizada y mejor
// y peor mes del periodo elegido. Cada medida lleva su explicación (#493).

const dias = (n: number) => `${n} ${n === 1 ? 'día' : 'días'}`
const mesTexto = (ym: string) => monthLabel({ year: Number(ym.slice(0, 4)), month: Number(ym.slice(5, 7)) })

function Medida({ titulo, icono: Icono, valor, tono, linea, ayuda, testid }: {
  titulo: string
  icono: typeof Activity
  valor: string
  tono?: 'positive' | 'negative'
  linea?: ReactNode
  ayuda: ReactNode
  testid?: string
}) {
  const color = tono === 'positive' ? 'text-positive-ink' : tono === 'negative' ? 'text-negative-ink' : 'text-fg'
  return (
    <div className="rounded-xl border border-border bg-background-card px-3.5 py-3 min-w-0" data-testid={testid}>
      <p className="flex items-center gap-1.5 text-[10.5px] uppercase tracking-widest text-fg-subtle">
        <Icono size={12} aria-hidden="true" />{titulo}
        <InfoTooltip label={`Cómo se calcula ${titulo.toLowerCase()}`}>{ayuda}</InfoTooltip>
      </p>
      <p className={`mt-1 text-xl font-bold mono tabular-nums ${color}`}>{valor}</p>
      {linea && <div className="mt-0.5 text-[11px] text-fg-muted">{linea}</div>}
    </div>
  )
}

export function VistaRiesgo({ riesgo, mejor, peor, currency }: {
  riesgo: Riesgo
  mejor: (TotalTramo & { mes: string }) | null
  peor: (TotalTramo & { mes: string }) | null
  currency: Currency
}) {
  const { maxima, actual } = riesgo
  return (
    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5" data-testid="vista-riesgo">
      <Medida titulo="Máxima caída" icono={TrendingDown} testid="maxima-caida"
        valor={maxima ? formatPercent(maxima.pct, 2) : 'Sin caídas'} tono={maxima ? 'negative' : undefined}
        linea={maxima && <>
          <p>Del {fechaCorta(maxima.desde)} al {fechaCorta(maxima.hasta)} ({dias(maxima.diasCaida)})</p>
          <p>{maxima.recuperado ? `Recuperada el ${fechaCorta(maxima.recuperado)}, en ${dias(maxima.diasRecuperacion ?? 0)}` : `Abierta: falta un ${formatPercent(maxima.faltaPct ?? 0, 1)} para recuperar el máximo`}</p>
        </>}
        ayuda={<>
          <p>La mayor bajada de la rentabilidad desde un máximo hasta el mínimo posterior, en el periodo elegido.</p>
          <p className="mt-1.5 text-fg-subtle">Se mide sobre la rentabilidad encadenada día a día (TWR), sin contar depósitos ni retiradas: meter o sacar dinero no la mueve. Es el mismo cálculo que la «Máx. caída» de Evolución. La recuperación es el primer día en que se vuelve a ese máximo.</p>
        </>} />
      <Medida titulo="Caída actual" icono={Waves}
        valor={actual ? (actual.pct === 0 ? 'En máximos' : formatPercent(actual.pct, 2)) : '—'} tono={actual && actual.pct < 0 ? 'negative' : undefined}
        linea={actual && actual.pct < 0 ? `Desde el máximo del ${fechaCorta(actual.desde)}` : undefined}
        ayuda={<p>Cuánto estás ahora por debajo del último máximo de la rentabilidad encadenada (TWR), sin depósitos ni retiradas. 0 significa que estás en máximos.</p>} />
      <Medida titulo="Volatilidad anual" icono={Activity} testid="volatilidad"
        valor={riesgo.volatilidadAnual === null ? '—' : formatPercent(riesgo.volatilidadAnual, 1)}
        linea={riesgo.volatilidadDiaria === null ? 'Hacen falta al menos 2 días' : `${formatPercent(riesgo.volatilidadDiaria, 2)} al día, con ${dias(riesgo.diasMedidos)}`}
        ayuda={<>
          <p>Cuánto oscila la rentabilidad diaria: la desviación típica de los rendimientos de cada día, multiplicada por la raíz de {DIAS_ANIO} para expresarla al año (el mercado cripto cotiza todos los días).</p>
          <p className="mt-1.5 text-fg-subtle">Orientativo: con una volatilidad del 60 %, en un año normal la rentabilidad puede moverse un 60 % arriba o abajo de su media. El día en curso no cuenta.</p>
        </>} />
      <Medida titulo="Mejor mes" icono={TrendingUp}
        valor={mejor ? signedPct(mejor.pct) : '—'} tono={mejor && mejor.pct > 0 ? 'positive' : undefined}
        linea={mejor && <span>{mesTexto(mejor.mes)}, {signedMoney(mejor.pnl, currency)}</span>}
        ayuda={<p>El mes con mayor rentabilidad del periodo, por Dietz modificado (pondera los depósitos y retiradas por el tiempo que estuvieron invertidos), como el calendario del P&L diario.</p>} />
      <Medida titulo="Peor mes" icono={CalendarRange}
        valor={peor ? signedPct(peor.pct) : '—'} tono={peor && peor.pct < 0 ? 'negative' : undefined}
        linea={peor && <span>{mesTexto(peor.mes)}, {signedMoney(peor.pnl, currency)}</span>}
        ayuda={<p>El mes con menor rentabilidad del periodo, por Dietz modificado, como el calendario del P&L diario.</p>} />
    </div>
  )
}
