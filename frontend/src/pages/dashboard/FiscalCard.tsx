import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, ChevronLeft, ChevronRight, Landmark } from 'lucide-react'
import { portfolioApi, type FiscalYear } from '../../api/portfolio'
import { formatEur } from '../../utils/format'
import { EurOnlyBadge } from '../../components/EurOnlyBadge'
import { PanelHeader, badgeClasses, iconButtonClasses, panelSurface, QueryError } from '../../components/ui'
import { fiscalSubtitle } from '../../utils/panelSubtitles'
import { baseTramosCompensada } from '../../utils/tramosIrpf'
import { deadlineFromHito, deadlineUrgency, estimatedTax } from '../../utils/fiscalPanel'
import { ejercicioPorDefecto, enlacesFiscal, perdidasQueCaducan, recuentoResultado } from '../../utils/fiscalDashboard'
import { hoyApp } from '../../utils/rangoGrafico'
import { useTramos } from '../../hooks/useTramos'
import { FISCAL_STALE_TIME } from '../fiscal/constants'
import { FiscalMonthly } from './FiscalMonthly'
import { HeroeFiscal } from './fiscal/HeroeFiscal'
import { BarraResultados } from './fiscal/BarraResultados'
import { Tira721 } from './fiscal/Tira721'
import { failure, type QueryLike } from '../../utils/queryFailure'
import { resumenEstado } from '../../utils/pasosDeclaracion'

// Panel fiscal del Dashboard (#236): resumen compacto de un ejercicio con el
// G/P neto realizado, la comparación de ganancias y pérdidas, la cuota IRPF
// estimada (con pérdidas compensadas, mismo cálculo que la página Fiscal), el
// estado del Modelo 721 y la cuenta atrás a la próxima fecha fiscal. Desde
// #515: selector de ejercicio (en campaña de la Renta, por defecto el anterior;
// no se guarda), héroe con dos cifras enlazadas y su desglose, barra de
// resultados con recuentos que abre Operaciones filtrada, meses pulsables con
// el acumulado, tira del 721 con el plazo y aviso de pérdidas que caducan.

export function FiscalCard({ data, dataQuery }: {
  data: FiscalYear[]
  /** Consulta de los ejercicios (Dashboard), para mostrar su fallo en la tarjeta (#498). */
  dataQuery?: QueryLike
}) {
  const today = hoyApp()
  const currentYear = Number(today.slice(0, 4))
  const anios = data.map(fy => fy.fiscal_year).sort((a, b) => a - b)
  const [elegido, setElegido] = useState<number | null>(null)
  const year = elegido !== null && anios.includes(elegido) ? elegido : ejercicioPorDefecto(today, anios)
  const current = data.find(fy => fy.fiscal_year === year)
  const enCurso = year === currentYear
  // Escala del ejercicio que se muestra (#452).
  const tramos = useTramos(year ?? undefined)

  // Mismas consultas (y caché) que la página Fiscal.
  const summaryQ = useQuery({
    queryKey: ['fiscal-summary-detail', year],
    queryFn: () => portfolioApi.getFiscalSummaryDetail(year!),
    enabled: !!year, staleTime: FISCAL_STALE_TIME,
  })
  const summary = summaryQ.data
  const carryforwardQ = useQuery({ queryKey: ['fiscal-carryforward'], queryFn: portfolioApi.getFiscalCarryforward, staleTime: FISCAL_STALE_TIME })
  const carryforward = carryforwardQ.data
  const monthlyQ = useQuery({
    queryKey: ['fiscal-monthly', year],
    queryFn: () => portfolioApi.getFiscalMonthly(year!),
    enabled: !!year, staleTime: FISCAL_STALE_TIME,
  })
  const monthly = monthlyQ.data
  const modelo721Q = useQuery({
    queryKey: ['fiscal-721', year],
    queryFn: () => portfolioApi.getFiscalModelo721(year!),
    enabled: !!year, staleTime: FISCAL_STALE_TIME,
  })
  // Operaciones del ejercicio (la misma caché que Operaciones de Fiscal) para los recuentos.
  // consulta de fondo (#498): sin los eventos, la barra se muestra sin los recuentos.
  const eventsQ = useQuery({
    queryKey: ['fiscal-events', year],
    queryFn: () => portfolioApi.getFiscalEvents(year!),
    enabled: !!year, staleTime: FISCAL_STALE_TIME,
  })
  // Próximo plazo: el mismo hito que Fiscal y la campana, calculado en el backend (#309).
  const calendarioQ = useQuery({ queryKey: ['fiscal-calendario'], queryFn: portfolioApi.getFiscalCalendar, staleTime: FISCAL_STALE_TIME })
  const calendario = calendarioQ.data
  // Estado de la declaración del último ejercicio cerrado (#542): el mismo origen que Fiscal.
  // consulta de fondo (#498): sin las marcas, la tarjeta no muestra la línea del estado.
  const declaracionesQ = useQuery({ queryKey: ['fiscal-declaraciones'], queryFn: portfolioApi.getDeclaraciones, staleTime: FISCAL_STALE_TIME })
  const ultimoCerrado = Math.max(0, ...anios.filter(y => y < currentYear))
  const estadoCerrado = declaracionesQ.data && ultimoCerrado > 0 ? resumenEstado(ultimoCerrado, declaracionesQ.data) : null
  // Un fallo de cualquiera de sus consultas se dice en la tarjeta, con Reintentar (#498).
  const fallo = failure(...(dataQuery ? [dataQuery] : []), summaryQ, carryforwardQ, monthlyQ, modelo721Q, calendarioQ)

  if (!current || year === null) {
    if (!fallo) return null
    return (
      <div className={panelSurface('none', 'overflow-hidden h-full flex flex-col')}>
        <PanelHeader icon={Landmark} title="Fiscal" className="px-5 py-4 border-b border-border" />
        <QueryError what="el resumen fiscal" error={fallo.error} onRetry={fallo.retry} />
      </div>
    )
  }

  const gainLoss = parseFloat(current.total_gain_loss_eur)
  const gains    = parseFloat(current.total_gains_eur)
  const losses   = parseFloat(current.total_losses_eur)
  const ops      = parseInt(current.num_operations, 10)
  const cfYear   = carryforward?.detalle.find(d => d.year === year)
  const base     = summary ? baseTramosCompensada(cfYear, summary.netoPatrimonial, summary.totalRendimientos) : null
  const tax      = base === null ? null : estimatedTax(base, tramos)
  const deadline = calendario ? deadlineFromHito(calendario.proximo) : null
  const urgency = deadline ? deadlineUrgency(deadline) : 'calm'
  const enlaces = enlacesFiscal(year, enCurso)
  const recuento = eventsQ.data ? recuentoResultado(eventsQ.data.fiscalEvents) : null
  const caducan = perdidasQueCaducan(carryforward, currentYear)
  const i = anios.indexOf(year)
  const nav = iconButtonClasses('sm', false, 'disabled:hover:bg-transparent')

  return (
    // Misma altura que Distribución: el gráfico mensual ocupa el espacio libre (#236).
    <div className={panelSurface('none', 'overflow-hidden h-full flex flex-col')}>
      <PanelHeader
        icon={Landmark}
        title="Fiscal"
        className="px-5 py-4 border-b border-border"
        extra={<EurOnlyBadge />}
        subtitle={fiscalSubtitle(year, ops)}
        actions={
          <div className="flex items-center gap-0.5" role="group" aria-label="Ejercicio fiscal">
            <button type="button" className={nav} disabled={i <= 0} onClick={() => setElegido(anios[i - 1])} aria-label={i > 0 ? `Ejercicio anterior: ${anios[i - 1]}` : 'Ejercicio anterior'}>
              <ChevronLeft size={16} aria-hidden="true" />
            </button>
            <span className="text-xs mono tabular-nums text-fg w-10 text-center" aria-live="polite" aria-label={`Ejercicio ${year}`}>{year}</span>
            <button type="button" className={nav} disabled={i >= anios.length - 1} onClick={() => setElegido(anios[i + 1])} aria-label={i < anios.length - 1 ? `Ejercicio siguiente: ${anios[i + 1]}` : 'Ejercicio siguiente'}>
              <ChevronRight size={16} aria-hidden="true" />
            </button>
          </div>
        }
      />

      <div className="p-5 flex flex-col gap-4 flex-1">
        {fallo && <QueryError what="parte del resumen fiscal" error={fallo.error} onRetry={fallo.retry} className="py-4" />}
        {caducan > 0 && (
          <Link to={enlaces.planificar} data-testid="aviso-caducan"
            className="flex items-start gap-1.5 rounded-lg border border-warning/30 bg-warning/10 px-2.5 py-1.5 text-xs text-warning-ink hover:bg-warning/15 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand">
            <AlertTriangle size={13} aria-hidden="true" className="mt-px shrink-0" />
            <span>{formatEur(caducan)} de pérdidas caducan este año si no las compensas. <span className="underline">Planificar</span></span>
          </Link>
        )}
        <HeroeFiscal year={year} enCurso={enCurso} gainLoss={gainLoss} gains={gains} losses={losses} ops={ops}
          rendimientos={summary?.totalRendimientos ?? null} base={base} compensado={cfYear?.compensado ?? 0} tax={tax} enlaces={enlaces} />
        <BarraResultados gains={gains} losses={losses} recuento={recuento} enlaces={enlaces} />
        {monthly && <FiscalMonthly meses={monthly.meses} year={year} enlaceMes={enlaces.mes} />}

        {estadoCerrado && (
          <Link to={`/fiscal?anio=${ultimoCerrado}`}
            className="flex items-center justify-between gap-3 rounded-xl border border-border bg-overlay/2 px-3 py-2 text-xs hover:bg-overlay/4 transition-colors focus:outline-hidden focus-visible:ring-2 focus-visible:ring-brand/60">
            <span className="text-fg-subtle">Declaración de {ultimoCerrado}</span>
            <span className={badgeClasses(estadoCerrado.tono)}>{estadoCerrado.texto}</span>
          </Link>
        )}

        <Tira721 modelo721={modelo721Q.data} plazo={deadline} urgencia={urgency} enlace721={enlaces.modelo721} />
      </div>
    </div>
  )
}
